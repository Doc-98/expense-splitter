import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

export default function AppHeader() {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
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
            <Link to="/guide" className="dropdown-item" onClick={() => setOpen(false)}>
              How to use
            </Link>
            <Link to="/stats" className="dropdown-item" onClick={() => setOpen(false)}>
              Your stats
            </Link>
            <Link to="/scan-settings" className="dropdown-item" onClick={() => setOpen(false)}>
              Scan settings
            </Link>
            <button type="button" className="dropdown-item" onClick={toggleTheme}>
              {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            </button>
            <Link to="/about" className="dropdown-item" onClick={() => setOpen(false)}>
              About
            </Link>
            <button type="button" className="dropdown-item dropdown-item-warn" onClick={signOut}>
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
