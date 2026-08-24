import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import Pagination from '../components/Pagination'
import { loadErrorMessage } from '../lib/loadErrorMessage'
import { useListKeyboardNav } from '../lib/useListKeyboardNav'

const GROUPS_PAGE_SIZE = 10

export default function Groups() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [groups, setGroups] = useState(null)
  const [groupsPage, setGroupsPage] = useState(0)
  const [newGroupName, setNewGroupName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

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

    if (membershipError) {
      setError(loadErrorMessage(membershipError))
      return
    }

    const groupIds = (memberships || []).map((m) => m.group_id)
    if (groupIds.length === 0) {
      setGroups([])
      return
    }

    const { data, error: groupsError } = await supabase
      .from('groups')
      .select('id, name, invite_code')
      .in('id', groupIds)

    if (groupsError) {
      setError(loadErrorMessage(groupsError))
      return
    }

    setGroups(data || [])
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

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Your groups</h1>
        <Link to="/stats" className="btn-link">
          Your stats
        </Link>
      </div>

      {error && <p className="status-error">{error}</p>}

      {groups === null && <p className="muted">Loading your groups…</p>}
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
                <span>{group.name}</span>
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
