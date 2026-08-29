import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useClickOutside } from '../lib/useClickOutside'
import { clearCachedPersonalGroupId } from '../lib/personalGroupCache'
import { groupViewCache } from '../lib/groupViewCache'
import { groupStatsCache } from '../lib/groupStatsCache'
import { accountStatsCache } from '../lib/accountStatsCache'
import { groupsListCache } from '../lib/groupsListCache'

// Bumped by hand with each PR — "1.<PR number>" rather than semver, since PRs
// merge in order on this branch and are already a visible, monotonic counter
// of what's shipped (cross-referenceable against GitHub directly). No CI
// wires this automatically, so it's on whoever opens the next PR to bump it.
const APP_VERSION = 'v1.32'

export default function AppHeader() {
  const { user, displayName } = useAuth()
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useClickOutside(menuRef, () => setOpen(false), open)

  async function signOut() {
    // On a shared device, stale cached data left behind for the next
    // person to sign in on this same tab — a personal-group id, or any of
    // these caches (now mirrored to sessionStorage, so surviving even
    // past this tab's own reload) — would paint the previous account's
    // data on screen, however briefly, or send them straight into that
    // account's own personal group. Every one of these is bare
    // module-level state with no account scoping of its own, so this is
    // the one place that has to know to clear all of them.
    clearCachedPersonalGroupId()
    groupsListCache.clear()
    groupViewCache.clear()
    groupStatsCache.clear()
    accountStatsCache.clear()
    await supabase.auth.signOut()
  }

  return (
    <div className="app-header">
      <Link to="/" className="app-header-brand">
        Expense Splitter
        <span className="muted app-header-version">{APP_VERSION}</span>
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
            {/* Everything that used to sit directly in this menu — theme,
                currency, thresholds, scan settings — now lives on this one
                page instead, alongside the new "change username" feature
                that's what actually called for a settings page to begin
                with. Keeps the menu itself to the handful of things you'd
                actually reach for in the moment (stats, the guide, signing
                out), rather than every account-level control living here
                permanently. */}
            <Link to="/settings" className="dropdown-item" onClick={() => setOpen(false)}>
              Settings
            </Link>
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
