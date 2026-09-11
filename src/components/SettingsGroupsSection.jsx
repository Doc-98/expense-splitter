import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useClickOutside } from '../lib/useClickOutside'
import { snapshotAndRemoveMember } from '../lib/leaveGroup'
import { fetchSettingsGroupsRows } from '../lib/prefetchSettings'
import { settingsGroupsCache, SETTINGS_GROUPS_CACHE_KEY } from '../lib/settingsGroupsCache'
import { getGroupViewPreferences, setGroupViewPreferences, AVATAR_SIZE_OPTIONS, avatarSizeSpec } from '../lib/groupViewPreferences'
import AvatarGlyph from './AvatarGlyph'
import ConfirmSheet from './ConfirmSheet'

const AVATAR_SIZE_LABELS = { small: 'Small', medium: 'Medium', large: 'Large' }

// The "⋮" per-row menu — same shape as BillActionsMenu.jsx's, just with
// one item so far (see the .row-menu-* rules in styles.css, a copy of
// .bill-menu-*'s under a name that isn't bill-specific). Kept as its own
// tiny component rather than inlined in the list below so open/close state
// and the outside-click handling don't have to be threaded through a loop.
function GroupRowMenu({ onLeave }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  useClickOutside(wrapRef, () => setOpen(false), open)

  return (
    <div className="row-menu-wrap" ref={wrapRef}>
      <button type="button" className="row-menu-btn" onClick={() => setOpen((o) => !o)} aria-label="Group actions">
        ⋮
      </button>
      {open && (
        <div className="row-menu-popover">
          <button
            type="button"
            className="dropdown-item dropdown-item-warn"
            onClick={() => {
              setOpen(false)
              onLeave()
            }}
          >
            Leave group
          </button>
        </div>
      )}
    </div>
  )
}

// Lists every group you're an active member of (the Personal space isn't
// here — it's not something you "leave", it's recreated the moment you
// open that tab again) with a way to leave one directly. GroupSettings'
// own member list already has this exact capability — this is a faster
// path for "which groups am I even in, and I want out of one" without
// opening that group first, not a replacement for it.
export default function SettingsGroupsSection() {
  const { user } = useAuth()
  // Seeded straight from settingsGroupsCache when there's anything there —
  // either from a prefetch fired the instant the account chip was clicked
  // (see prefetchSettings.js/AppHeader.jsx) or a previous visit this
  // session — so this section has real data to paint from its very first
  // render instead of "Loading…" every single time, the same "paint from
  // cache, then quietly revalidate" trick groupsListCache.js already gets
  // Groups.jsx.
  const [groups, setGroups] = useState(() => settingsGroupsCache.get(SETTINGS_GROUPS_CACHE_KEY) ?? null) // null = still loading
  const [error, setError] = useState(null)
  const [pendingLeave, setPendingLeave] = useState(null) // { id, name, memberId } | null
  const [leaving, setLeaving] = useState(false)
  const [prefs, setPrefs] = useState(getGroupViewPreferences)

  function updatePref(partial) {
    setPrefs(setGroupViewPreferences(partial))
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      setError(null)
      try {
        const rows = await fetchSettingsGroupsRows(user.id)
        if (cancelled) return
        setGroups(rows)
        settingsGroupsCache.set(SETTINGS_GROUPS_CACHE_KEY, rows)
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [user.id])

  async function confirmLeave() {
    if (!pendingLeave || leaving) return
    setLeaving(true)
    setError(null)
    try {
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('categories')
        .select('id, name')
        .eq('group_id', pendingLeave.id)
      if (categoriesError) throw new Error(categoriesError.message)

      await snapshotAndRemoveMember({
        groupId: pendingLeave.id,
        groupName: pendingLeave.name,
        member: { id: pendingLeave.memberId, userId: user.id },
        categories: categoriesData || [],
      })
      setGroups((gs) => {
        const next = gs.filter((g) => g.id !== pendingLeave.id)
        settingsGroupsCache.set(SETTINGS_GROUPS_CACHE_KEY, next)
        return next
      })
      setPendingLeave(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLeaving(false)
    }
  }

  return (
    <>
      <h2 className="settings-section-title">Your groups</h2>
      <p className="muted">
        Leaving a group here does the same thing as Leave in that group's own Settings — this is
        just a faster way to get to it from one place.
      </p>

      {error && <p className="status-error">{error}</p>}

      {groups === null ? (
        <p className="muted">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="empty-state">You're not in any groups yet.</p>
      ) : (
        <ul className="card-list">
          {groups.map((g) => (
            <li key={g.id} className="card-list-item">
              <span className="card-list-item-main">
                <span className="card-list-item-title">
                  {g.name}
                  {g.isAdmin && <span className="role-tag"> (admin)</span>}
                </span>
                <span className="card-list-item-note">
                  {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
                </span>
              </span>
              <GroupRowMenu onLeave={() => setPendingLeave(g)} />
            </li>
          ))}
        </ul>
      )}

      <h2 className="settings-section-title">Display</h2>
      <p className="muted">
        Applies to every group's page alike, not one at a time — if you don't want these, you
        almost certainly don't want them anywhere.
      </p>
      <div className="settings-row">
        <span>Show Quick stats on the group page</span>
        <label className="switch">
          <input
            type="checkbox"
            checked={prefs.showQuickStats}
            onChange={(e) => updatePref({ showQuickStats: e.target.checked })}
            aria-label="Show Quick stats on the group page"
          />
          <span className="switch-slider" />
        </label>
      </div>
      <div className="settings-row">
        <span>Show "You lent/borrowed" on each bill</span>
        <label className="switch">
          <input
            type="checkbox"
            checked={prefs.showLentBorrowedStatus}
            onChange={(e) => updatePref({ showLentBorrowedStatus: e.target.checked })}
            aria-label="Show 'You lent' or 'You borrowed' status on each bill"
          />
          <span className="switch-slider" />
        </label>
      </div>
      <div className="settings-row">
        <span>Sticky filters</span>
        <label className="switch">
          <input
            type="checkbox"
            checked={prefs.stickyFilters}
            onChange={(e) => updatePref({ stickyFilters: e.target.checked })}
            aria-label="Keep a group page's search and filters active after opening a bill"
          />
          <span className="switch-slider" />
        </label>
      </div>
      <p className="muted">
        When on, a group page's search box and filters stay exactly as you left them after you
        open a bill and come back — right now they reset the moment you leave. Off (the default)
        keeps today's behavior. Either way, reloading the page itself still clears them.
      </p>

      <div className="settings-row">
        <span>Split-with avatar size</span>
      </div>
      <div className="size-picker">
        {AVATAR_SIZE_OPTIONS.map((size) => {
          const { iconPx, className } = avatarSizeSpec(size)
          return (
            <button
              key={size}
              type="button"
              className={`size-picker-option ${prefs.avatarSize === size ? 'is-selected' : ''}`}
              onClick={() => updatePref({ avatarSize: size })}
              aria-pressed={prefs.avatarSize === size}
            >
              <span className={`avatar ${className}`} aria-hidden="true">
                <AvatarGlyph iconId="bomb" name="Preview" size={iconPx} />
              </span>
              {AVATAR_SIZE_LABELS[size]}
            </button>
          )
        })}
      </div>
      <p className="muted">
        Applies to the "Split with" circles on a bill and each of its items — the picker used to
        choose who's in on an expense.
      </p>

      {pendingLeave && (
        <ConfirmSheet
          title={`Leave ${pendingLeave.name}?`}
          body="You'll lose access to its bills and balance unless someone invites you back in. Your stats for this group are kept, just frozen as of right now."
          confirmLabel={leaving ? 'Leaving…' : 'Leave'}
          onConfirm={confirmLeave}
          onCancel={() => !leaving && setPendingLeave(null)}
        />
      )}
    </>
  )
}
