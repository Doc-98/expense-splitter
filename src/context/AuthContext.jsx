import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // undefined = still checking, null = signed out, object = signed in
  const [session, setSession] = useState(undefined)
  // Lives here (rather than AppHeader fetching it locally, which is how
  // this used to work) so it's one shared value both AppHeader's own chip
  // button and the Settings page's "change username" form read from and
  // write to — changing it in Settings shows up in the header instantly,
  // with no refetch or page reload needed to see your own new name.
  const [displayName, setDisplayName] = useState('')
  const user = session?.user ?? null

  useEffect(() => {
    // A network failure here (e.g. the refresh a near-expired token needs)
    // already comes back as `{ data: { session: null }, error }`, never a
    // thrown rejection — session ends up null either way, which is the
    // SDK's own call to make, not something to second-guess here. Logging
    // the error is just so that's visible somewhere rather than a
    // completely silent "why am I signed out" with nothing to go on.
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error('Failed to restore session:', error.message)
      setSession(data.session ?? null)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadProfile() {
      if (!user) return
      const { data, error } = await supabase.from('profiles').select('display_name').eq('id', user.id).single()
      if (cancelled) return
      if (error) {
        // Leaves whatever displayName is already showing alone rather than
        // regressing it to the email-prefix fallback — a transient network
        // failure here shouldn't make someone's real name disappear.
        console.error('Failed to load display name:', error.message)
        return
      }
      setDisplayName(data?.display_name || user.email?.split('@')[0] || 'Account')
    }
    loadProfile()
    return () => {
      cancelled = true
    }
  }, [user])

  return (
    <AuthContext.Provider value={{ session, user, displayName, setDisplayName }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
