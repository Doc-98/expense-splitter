import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function Groups() {
  const { user } = useAuth()
  const [groups, setGroups] = useState(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadGroups()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadGroups() {
    const { data: memberships, error: membershipError } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id)

    if (membershipError) {
      setError(membershipError.message)
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
      setError(groupsError.message)
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
      <h1 className="page-title">Your groups</h1>

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
      {error && <p className="status-error">{error}</p>}

      {groups === null && <p className="muted">Loading your groups…</p>}
      {groups?.length === 0 && (
        <p className="empty-state">
          No groups yet — create one above, or open an invite link a friend sent you.
        </p>
      )}

      <ul className="card-list">
        {groups?.map((group) => (
          <li key={group.id}>
            <Link to={`/groups/${group.id}`} className="card-list-item">
              <span>{group.name}</span>
              <span className="chevron">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
