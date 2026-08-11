import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { fetchAllGroupMembers } from '../lib/members'

export default function GroupSettings() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [members, setMembers] = useState([])
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  const loadGroup = useCallback(async () => {
    const { data } = await supabase.from('groups').select('*').eq('id', groupId).single()
    setName(data?.name || '')
  }, [groupId])

  const loadMembers = useCallback(async () => {
    setMembers(await fetchAllGroupMembers(groupId))
  }, [groupId])

  useEffect(() => {
    loadGroup()
    loadMembers()
  }, [loadGroup, loadMembers])

  async function saveName(e) {
    e.preventDefault()
    if (!name.trim()) return
    const { error: renameError } = await supabase
      .from('groups')
      .update({ name: name.trim() })
      .eq('id', groupId)
    if (renameError) {
      setError(renameError.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    }
  }

  async function removeMember(memberId, isSelf) {
    const label = isSelf ? 'leave this group' : 'remove this person from the group'
    if (!window.confirm(`Are you sure you want to ${label}? Their past bills and payments stay on record.`)) {
      return
    }
    const { error: removeError } = await supabase
      .from('group_members')
      .update({ active: false })
      .eq('group_id', groupId)
      .eq('user_id', memberId)

    if (removeError) {
      setError(removeError.message)
      return
    }

    if (isSelf) {
      navigate('/')
    } else {
      loadMembers()
    }
  }

  const activeMembers = members.filter((m) => m.active)
  const formerMembers = members.filter((m) => !m.active)

  return (
    <div className="page">
      <header className="page-header">
        <Link to={`/groups/${groupId}`} className="btn-link">
          ← Back
        </Link>
        <h1>Group settings</h1>
      </header>

      <h2 className="settings-section-title">Group name</h2>
      <form onSubmit={saveName} className="inline-form">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" />
        <button type="submit" className="btn-primary">
          {saved ? 'Saved!' : 'Save'}
        </button>
      </form>

      <h2 className="settings-section-title">Members ({activeMembers.length})</h2>
      <ul className="member-list">
        {activeMembers.map((m) => (
          <li key={m.id} className="member-list-item">
            <span>
              {m.name}
              {m.id === user.id && <span className="muted"> (you)</span>}
            </span>
            <button type="button" className="btn-link dropdown-item-warn" onClick={() => removeMember(m.id, m.id === user.id)}>
              {m.id === user.id ? 'Leave' : 'Remove'}
            </button>
          </li>
        ))}
      </ul>

      {formerMembers.length > 0 && (
        <>
          <h2 className="settings-section-title">Former members</h2>
          <p className="muted">
            They've left the group, but their bills, items, and payments are still kept. If they use the
            invite link again, they'll pick up right where they left off.
          </p>
          <ul className="member-list">
            {formerMembers.map((m) => (
              <li key={m.id} className="member-list-item former">
                <span>{m.name}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {error && <p className="status-error">{error}</p>}
    </div>
  )
}
