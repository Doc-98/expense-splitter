import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useCurrency, CURRENCIES } from '../context/CurrencyContext'
import { useClickOutside } from '../lib/useClickOutside'

export default function AppHeader() {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { code, setCurrency } = useCurrency()
  const [displayName, setDisplayName] = useState('')
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useClickOutside(menuRef, () => setOpen(false), open)

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
      <div className="account-menu" ref={menuRef}>
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
            <Link to="/thresholds" className="dropdown-item" onClick={() => setOpen(false)}>
              Spending thresholds
            </Link>
            <Link to="/scan-settings" className="dropdown-item" onClick={() => setOpen(false)}>
              Scan settings
            </Link>
            <button type="button" className="dropdown-item" onClick={toggleTheme}>
              {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            </button>
            <div className="dropdown-item dropdown-item-currency">
              <span>Currency</span>
              <select value={code} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.symbol} {c.code}
                  </option>
                ))}
              </select>
            </div>
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
