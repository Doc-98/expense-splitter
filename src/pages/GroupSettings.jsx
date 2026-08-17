import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { fetchAllGroupMembers, addGuest, setGuestActive, renameGuest } from '../lib/members'
import { computeBalances, computeDailyTotalsForUser } from '../lib/settlement'

export default function GroupSettings() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [members, setMembers] = useState([])
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [editingGuestId, setEditingGuestId] = useState(null)
  const [editingGuestName, setEditingGuestName] = useState('')

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

  async function submitAddGuest(e) {
    e.preventDefault()
    if (!guestName.trim()) return
    setError(null)
    try {
      await addGuest(groupId, guestName.trim())
      setGuestName('')
      loadMembers()
    } catch (err) {
      setError(err.message)
    }
  }

  async function saveGuestRename(memberId) {
    if (!editingGuestName.trim()) return
    setError(null)
    try {
      await renameGuest(memberId, editingGuestName.trim())
      setEditingGuestId(null)
      loadMembers()
    } catch (err) {
      setError(err.message)
    }
  }

  async function toggleGuestActive(member, active) {
    setError(null)
    try {
      await setGuestActive(member.id, active)
      loadMembers()
    } catch (err) {
      setError(err.message)
    }
  }

  // Real accounts go through remove_group_member — this both revokes their
  // access (they'd otherwise keep querying group data forever) and freezes
  // a personal record of their history first, while they still can. Guests
  // never had that access to begin with, so removing one is just flipping
  // active off directly (see toggleGuestActive above) — no snapshot needed.
  async function removeRealMember(member) {
    const isSelf = member.userId === user.id
    const label = isSelf ? 'leave this group' : 'remove this person from the group'
    if (
      !window.confirm(
        `Are you sure you want to ${label}? Your stats for this group are kept, just frozen as of right now.`
      )
    ) {
      return
    }

    setError(null)

    const { data: billsData, error: billsError } = await supabase
      .from('bills')
      .select('id, paid_by, created_at, items(id, total_price, item_shares(member_id, shares))')
      .eq('group_id', groupId)

    if (billsError) {
      setError(billsError.message)
      return
    }

    const bills = (billsData || []).map((b) => ({ id: b.id, paid_by: b.paid_by, created_at: b.created_at }))
    const items = []
    const itemShares = []
    for (const bill of billsData || []) {
      for (const item of bill.items || []) {
        items.push({ id: item.id, bill_id: bill.id, total_price: item.total_price })
        for (const share of item.item_shares || []) {
          itemShares.push({ item_id: item.id, user_id: share.member_id, shares: share.shares })
        }
      }
    }

    const { data: paymentsData, error: paymentsError } = await supabase
      .from('payments')
      .select('from_member, to_member, amount')
      .eq('group_id', groupId)

    if (paymentsError) {
      setError(paymentsError.message)
      return
    }

    const paymentsForBalances = (paymentsData || []).map((p) => ({
      from_user: p.from_member,
      to_user: p.to_member,
      amount: p.amount,
    }))

    const balances = computeBalances({ bills, items, itemShares, payments: paymentsForBalances })
    const dailyTotals = computeDailyTotalsForUser(member.id, { bills, items, itemShares })

    const { error: removeError } = await supabase.rpc('remove_group_member', {
      target_group_id: groupId,
      target_user_id: member.userId,
      group_name: name,
      snapshot_balance: balances[member.id] || 0,
      snapshot_daily: dailyTotals,
    })

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

  const activeRealMembers = members.filter((m) => m.active && !m.isGuest)
  const activeGuests = members.filter((m) => m.active && m.isGuest)
  const formerRealMembers = members.filter((m) => !m.active && !m.isGuest)
  const archivedGuests = members.filter((m) => !m.active && m.isGuest)

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

      <h2 className="settings-section-title">Members ({activeRealMembers.length})</h2>
      <ul className="member-list">
        {activeRealMembers.map((m) => (
          <li key={m.id} className="member-list-item">
            <span>
              {m.name}
              {m.userId === user.id && <span className="muted"> (you)</span>}
            </span>
            <button
              type="button"
              className="btn-link dropdown-item-warn"
              onClick={() => removeRealMember(m)}
            >
              {m.userId === user.id ? 'Leave' : 'Remove'}
            </button>
          </li>
        ))}
      </ul>

      <h2 className="settings-section-title">Guests ({activeGuests.length})</h2>
      <p className="muted">
        People without an account of their own — add anyone who's splitting a bill but doesn't want to
        sign up. They can be assigned to items and settled up with exactly like anyone else.
      </p>
      <ul className="member-list">
        {activeGuests.map((m) => (
          <li key={m.id} className="member-list-item">
            {editingGuestId === m.id ? (
              <form
                className="guest-rename-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  saveGuestRename(m.id)
                }}
              >
                <input
                  value={editingGuestName}
                  onChange={(e) => setEditingGuestName(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="btn-link">
                  Save
                </button>
                <button type="button" className="btn-link" onClick={() => setEditingGuestId(null)}>
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <span>
                  {m.name} <span className="muted">(guest)</span>
                </span>
                <span className="member-list-actions">
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => {
                      setEditingGuestId(m.id)
                      setEditingGuestName(m.name)
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="btn-link dropdown-item-warn"
                    onClick={() => toggleGuestActive(m, false)}
                  >
                    Remove
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={submitAddGuest} className="inline-form">
        <input
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          placeholder="Guest's name"
        />
        <button type="submit" className="btn-primary">
          Add guest
        </button>
      </form>

      {formerRealMembers.length > 0 && (
        <>
          <h2 className="settings-section-title">Former members</h2>
          <p className="muted">
            They've left the group, but their bills, items, and payments are still kept — and their own
            stats page keeps a frozen record of what they spent here. If they use the invite link again,
            they'll pick up right where they left off.
          </p>
          <ul className="member-list">
            {formerRealMembers.map((m) => (
              <li key={m.id} className="member-list-item former">
                <span>{m.name}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {archivedGuests.length > 0 && (
        <>
          <h2 className="settings-section-title">Archived guests</h2>
          <p className="muted">
            Kept on old bills, but won't be offered for new ones. Restore any time.
          </p>
          <ul className="member-list">
            {archivedGuests.map((m) => (
              <li key={m.id} className="member-list-item former">
                <span>{m.name}</span>
                <button type="button" className="btn-link" onClick={() => toggleGuestActive(m, true)}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {error && <p className="status-error">{error}</p>}
    </div>
  )
}
