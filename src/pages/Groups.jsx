import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import Pagination from '../components/Pagination'
import { loadErrorMessage } from '../lib/loadErrorMessage'
import { useListKeyboardNav } from '../lib/useListKeyboardNav'
import { getCachedPersonalGroupId, setCachedPersonalGroupId } from '../lib/personalGroupCache'
import { getRecentGroupIds } from '../lib/recentGroups'
import { warmUpTopGroups } from '../lib/prefetchGroup'
import BootSplash from '../components/BootSplash'
import { groupsListCache, GROUPS_LIST_CACHE_KEY } from '../lib/groupsListCache'

const GROUPS_PAGE_SIZE = 10

export default function Groups() {
  const { user } = useAuth()
  const navigate = useNavigate()
  // Seeded straight from groupsListCache when there's anything there — a
  // refresh (or a revisit to "/" later this session) then has real data to
  // paint from its very first render, same as GroupView.jsx/GroupStats.jsx
  // already do, rather than starting null and showing the boot splash (or,
  // for a revisit, the plain "Loading your groups…" text) all over again
  // for data it already had.
  const [groups, setGroups] = useState(() => groupsListCache.get(GROUPS_LIST_CACHE_KEY) ?? null)
  const [groupsPage, setGroupsPage] = useState(0)
  const [newGroupName, setNewGroupName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
  // Not a real view of its own — clicking "Personal" fetches (or, the very
  // first time, silently creates) the one-per-account personal group via
  // get_or_create_personal_group() and drops straight into it, the same
  // place clicking any group card in the list below lands. So this is only
  // ever true for the instant between the click and that navigation — long
  // enough to disable the tab and show it's doing something, never a
  // second page of its own.
  const [openingPersonal, setOpeningPersonal] = useState(false)
  // Fixed once, at mount, regardless of how many times this component
  // re-renders before the initial load settles — see the comment on
  // loadGroups' use of it below.
  const startedWithNothingCachedRef = useRef(groups === null)

  const visibleGroups = groups
    ? groups.slice(groupsPage * GROUPS_PAGE_SIZE, (groupsPage + 1) * GROUPS_PAGE_SIZE)
    : []
  // Same ↑/↓/Enter/←/→ keyboard navigation as the bill list on a group's
  // own page (see useListKeyboardNav.js) — this list is a flat one (no
  // date dividers to group by), so it's a plain index into visibleGroups
  // rather than needing GroupView.jsx's extra "flatten the day/month
  // groups back into one order" step.
  const groupNav = useListKeyboardNav({
    page: groupsPage,
    setPage: setGroupsPage,
    maxPage: Math.max(0, Math.ceil((groups?.length || 0) / GROUPS_PAGE_SIZE) - 1),
    itemCount: visibleGroups.length,
    onOpen: (index) => {
      const group = visibleGroups[index]
      if (group) navigate(`/groups/${group.id}`)
    },
  })

  useEffect(() => {
    loadGroups()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!groups) return
    const maxPage = Math.max(0, Math.ceil(groups.length / GROUPS_PAGE_SIZE) - 1)
    if (groupsPage > maxPage) setGroupsPage(maxPage)
  }, [groups, groupsPage])

  async function loadGroups() {
    const { data: memberships, error: membershipError } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id)
      .eq('active', true)

    // The one case an error means `groups` needs to become a real (empty)
    // value rather than staying null: starting with nothing cached, null
    // would leave the boot splash up forever instead of ever showing the
    // error banner. A reload that *does* have something on screen already
    // (a cache hit, or any load that already succeeded once) just records
    // the error and leaves the list as it was — no reason to blank out
    // data that's still probably right.
    if (membershipError) {
      setError(loadErrorMessage(membershipError))
      if (startedWithNothingCachedRef.current) setGroups([])
      return
    }

    const groupIds = (memberships || []).map((m) => m.group_id)
    if (groupIds.length === 0) {
      setGroups([])
      groupsListCache.set(GROUPS_LIST_CACHE_KEY, [])
      return
    }

    const { data, error: groupsError } = await supabase
      .from('groups')
      .select('id, name, invite_code')
      .in('id', groupIds)
      // The personal group (see the Personal tab below) is a real row in
      // this same table and this account is really a member of it, so
      // without this filter it would otherwise show up as a perfectly
      // ordinary — and confusingly invite-code-less, single-person — entry
      // in "Your groups" too.
      .eq('is_personal', false)

    if (groupsError) {
      setError(loadErrorMessage(groupsError))
      if (startedWithNothingCachedRef.current) setGroups([])
      return
    }

    setGroups(data || [])
    groupsListCache.set(GROUPS_LIST_CACHE_KEY, data || [])

    // Fire-and-forget — nothing here waits on it, it just warms
    // groupViewCache in the background for whichever group (or the
    // personal space) you open next. See prefetchGroup.js for why this is
    // scoped to a recent window rather than each group's full history.
    if (data && data.length > 0) {
      warmUpTopGroups(
        data.map((g) => g.id),
        getRecentGroupIds(),
        getCachedPersonalGroupId()
      )
    }
  }

  async function openPersonal() {
    // Once we already know the id (from earlier this session), skip the
    // round-trip entirely — get_or_create_personal_group() is cheap, but
    // "already know where to go" beats "ask again" every time.
    const cachedId = getCachedPersonalGroupId()
    if (cachedId) {
      navigate(`/groups/${cachedId}`)
      return
    }
    setOpeningPersonal(true)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('get_or_create_personal_group')
    if (rpcError) {
      setError(rpcError.message)
      setOpeningPersonal(false)
      return
    }
    setCachedPersonalGroupId(data.id)
    navigate(`/groups/${data.id}`)
  }

  async function createGroup(e) {
    e.preventDefault()
    if (!newGroupName.trim()) return
    setCreating(true)
    setError(null)

    const { error: rpcError } = await supabase.rpc('create_group', {
      name: newGroupName.trim(),
    })

    if (rpcError) {
      setError(rpcError.message)
    } else {
      setNewGroupName('')
      loadGroups()
    }
    setCreating(false)
  }

  // Nothing cached and the real fetch hasn't resolved yet — the only case
  // left where there's truly nothing worth painting. Once this fires even
  // once, `groups` is never null again for the life of this component (see
  // loadGroups above), so this can never reappear later just because a
  // reload is in flight.
  if (groups === null) return <BootSplash />

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Your groups</h1>
        <Link to="/stats" className="btn-link">
          Your stats
        </Link>
      </div>

      <div className="tab-row">
        <button type="button" className="tab active">
          Your groups
        </button>
        <button type="button" className="tab" onClick={openPersonal} disabled={openingPersonal}>
          {openingPersonal ? 'Opening…' : 'Personal'}
        </button>
      </div>

      {error && <p className="status-error">{error}</p>}

      {groups?.length === 0 && (
        <p className="empty-state">
          No groups yet — create one below, or open an invite link a friend sent you.
        </p>
      )}

      <ul className="card-list" onMouseMove={groupNav.onListMouseMove}>
        {visibleGroups.map((group, index) => {
          const isFocused = groupNav.active && index === groupNav.focusedIndex
          return (
            <li key={group.id} className={isFocused ? 'list-row-focused' : ''} ref={isFocused ? groupNav.rowRef : null}>
              <Link to={`/groups/${group.id}`} className="card-list-item">
                <span className="card-list-item-title">{group.name}</span>
                <span className="chevron">→</span>
              </Link>
            </li>
          )
        })}
      </ul>
      <Pagination page={groupsPage} setPage={setGroupsPage} totalItems={groups?.length || 0} pageSize={GROUPS_PAGE_SIZE} />

      <h2 className="settings-section-title section-always-divided">Create a new group</h2>
      <form onSubmit={createGroup} className="inline-form">
        <input
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          placeholder="New group name (e.g. Flat 3B)"
        />
        <button type="submit" className="btn-primary" disabled={creating}>
          Create
        </button>
      </form>
    </div>
  )
}
