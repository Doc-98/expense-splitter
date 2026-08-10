import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function AppHeader() {
  const { user } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadProfile() {
      if (!user) return
      const { data } = await supabase.from('profiles').select('display_name').eq('id', user.id).single()
      if (!cancelled) setDisplayName(data?.display_name || user.email?.split('@')[0] || 'Account')
    }
    loadProfile()
    return () => {
      cancelled = true
    }
  }, [user])

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <div className="app-header">
      <Link to="/" className="app-header-brand">
        Spesa
      </Link>
      <div className="account-menu">
        <button
          type="button"
          className="account-chip"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {displayName || '…'}
        </button>
        {open && (
          <div className="account-dropdown">
            <p className="account-email">{user?.email}</p>
            <button type="button" className="btn-link" onClick={signOut}>
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
