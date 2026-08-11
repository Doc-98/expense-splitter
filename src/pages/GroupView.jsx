import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { fetchAllGroupMembers } from '../lib/members'
import { computeBalances, simplifyDebts } from '../lib/settlement'
import SettlementSummary from '../components/SettlementSummary'

export default function GroupView() {
  const { groupId } = useParams()
  const { user } = useAuth()

  const [group, setGroup] = useState(null)
  const [allMembers, setAllMembers] = useState([])
  const [showMembers, setShowMembers] = useState(false)
  const [bills, setBills] = useState(null)
  const [newBillTitle, setNewBillTitle] = useState('')
  const [copied, setCopied] = useState(false)
  const [settlement, setSettlement] = useState(null)
  const [payments, setPayments] = useState([])
  const [error, setError] = useState(null)

  const activeMembers = allMembers.filter((m) => m.active)

  const loadGroup = useCallback(async () => {
    const { data } = await supabase.from('groups').select('*').eq('id', groupId).single()
    setGroup(data)
  }, [groupId])

  const loadMembers = useCallback(async () => {
    setAllMembers(await fetchAllGroupMembers(groupId))
  }, [groupId])

  const loadBills = useCallback(async () => {
    const { data } = await supabase
      .from('bills')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
    setBills(data || [])
  }, [groupId])

  const loadSettlement = useCallback(async () => {
    const { data: billsData } = await supabase
      .from('bills')
      .select('id, paid_by, items(id, total_price, item_shares(user_id, shares))')
      .eq('group_id', groupId)

    const { data: paymentsData } = await supabase
      .from('payments')
      .select('id, from_user, to_user, amount, created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })

    setPayments(paymentsData || [])

    if (!billsData) return

    const items = []
    const itemShares = []
    for (const bill of billsData) {
      for (const item of bill.items || []) {
        items.push({ id: item.id, bill_id: bill.id, total_price: item.total_price })
        for (const share of item.item_shares || []) {
          itemShares.push({ item_id: item.id, user_id: share.user_id, shares: share.shares })
        }
      }
    }

    const balances = computeBalances({ bills: billsData, items, itemShares, payments: paymentsData || [] })
    setSettlement(simplifyDebts(balances))
  }, [groupId])

  const reloadAll = useCallback(() => {
    loadBills()
    loadSettlement()
  }, [loadBills, loadSettlement])

  useEffect(() => {
    loadGroup()
    loadMembers()
    reloadAll()

    const channel = supabase
      .channel(`group-${groupId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, reloadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, reloadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_shares' }, reloadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, reloadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, loadMembers)
      .subscribe()

    return () => supabase.removeChannel(channel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  async function createBill(e) {
    e.preventDefault()
    const { data, error: createError } = await supabase
      .from('bills')
      .insert({
        group_id: groupId,
        title: newBillTitle.trim() || 'New bill',
        created_by: user.id,
        paid_by: user.id,
      })
      .select()
      .single()

    if (createError) {
      setError(createError.message)
    } else {
      setNewBillTitle('')
      window.location.href = `/groups/${groupId}/bills/${data.id}`
    }
  }

  function copyInvite() {
    const link = `${window.location.origin}/join/${group.invite_code}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function recordPayment(fromUserId, toUserId, amount) {
    if (!fromUserId || !toUserId || fromUserId === toUserId || !amount) return
    setError(null)
    const { error: paymentError } = await supabase.from('payments').insert({
      group_id: groupId,
      from_user: fromUserId,
      to_user: toUserId,
      amount,
      created_by: user.id,
    })
    if (paymentError) setError(paymentError.message)
    loadSettlement()
  }

  async function deletePayment(paymentId) {
    if (!window.confirm('Delete this payment record?')) return
    setError(null)
    const { error: deleteError } = await supabase.from('payments').delete().eq('id', paymentId)
    if (deleteError) setError(deleteError.message)
    loadSettlement()
  }

  async function deleteBill(bill) {
    if (!window.confirm(`Delete "${bill.title}"? This removes all its items too.`)) return
    setError(null)
    const { error: deleteError } = await supabase.from('bills').delete().eq('id', bill.id)
    if (deleteError) setError(deleteError.message)
    reloadAll()
  }

  return (
    <div className="page">
      <header className="page-header">
        <Link to="/" className="btn-link">
          ← Groups
        </Link>
        <h1>{group?.name}</h1>
        <Link to={`/groups/${groupId}/stats`} className="btn-link">
          Stats
        </Link>
        <Link to={`/groups/${groupId}/settings`} className="btn-link">
          Settings
        </Link>
      </header>

      <div className="group-actions">
        <button className="btn-secondary" onClick={copyInvite}>
          {copied ? 'Link copied!' : 'Copy invite link'}
        </button>
        <div className="member-count-wrap">
          <button type="button" className="member-count-btn" onClick={() => setShowMembers((s) => !s)}>
            {activeMembers.length} {activeMembers.length === 1 ? 'person' : 'people'}
          </button>
          {showMembers && (
            <div className="member-count-popover">
              <ul>
                {activeMembers.map((m) => (
                  <li key={m.id}>{m.name}</li>
                ))}
              </ul>
              <Link to={`/groups/${groupId}/settings`} className="btn-link">
                Manage members →
              </Link>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={createBill} className="inline-form">
        <input
          value={newBillTitle}
          onChange={(e) => setNewBillTitle(e.target.value)}
          placeholder="New bill (e.g. Lidl - Tuesday)"
        />
        <button type="submit" className="btn-primary">
          Start
        </button>
      </form>

      {bills?.length === 0 && (
        <p className="empty-state">No bills yet. Start one above, then scan or add a receipt.</p>
      )}

      <ul className="card-list">
        {bills?.map((bill) => (
          <li key={bill.id} className="bill-list-item">
            <Link to={`/groups/${groupId}/bills/${bill.id}`} className="card-list-item">
              <span className="card-list-item-main">
                <span>{bill.title}</span>
                {bill.note && <span className="card-list-item-note">{bill.note}</span>}
              </span>
              <span className="chevron">→</span>
            </Link>
            <button
              type="button"
              className="btn-icon"
              onClick={() => deleteBill(bill)}
              aria-label={`Delete ${bill.title}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {error && <p className="status-error">{error}</p>}

      <SettlementSummary
        transactions={settlement}
        members={allMembers}
        payments={payments}
        onRecordPayment={recordPayment}
        onDeletePayment={deletePayment}
      />
    </div>
  )
}
