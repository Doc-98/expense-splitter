import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { fetchAllGroupMembers } from '../lib/members'
import { computeBalances, computeDailyTotalsForUser } from '../lib/settlement'

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
    if (!window.confirm(`Are you sure you want to ${label}? Your stats for this group are kept, just frozen as of right now.`)) {
      return
    }

    setError(null)

    // Compute their frozen record from the group's full data while access
    // still allows it — this is the last moment that's possible, since
    // removing them is what cuts that access off.
    const { data: billsData, error: billsError } = await supabase
      .from('bills')
      .select('id, paid_by, created_at, items(id, total_price, item_shares(user_id, shares))')
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
          itemShares.push({ item_id: item.id, user_id: share.user_id, shares: share.shares })
        }
      }
    }

    const { data: paymentsData, error: paymentsError } = await supabase
      .from('payments')
      .select('from_user, to_user, amount')
      .eq('group_id', groupId)

    if (paymentsError) {
      setError(paymentsError.message)
      return
    }

    const balances = computeBalances({ bills, items, itemShares, payments: paymentsData || [] })
    const dailyTotals = computeDailyTotalsForUser(memberId, { bills, items, itemShares })

    const { error: removeError } = await supabase.rpc('remove_group_member', {
      target_group_id: groupId,
      target_user_id: memberId,
      group_name: name,
      snapshot_balance: balances[memberId] || 0,
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
            They've left the group, but their bills, items, and payments are still kept — and their own
            stats page keeps a frozen record of what they spent here. If they use the invite link again,
            they'll pick up right where they left off.
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
