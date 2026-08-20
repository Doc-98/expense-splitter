import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { fetchAllGroupMembers } from '../lib/members'
import { computeBalances, simplifyDebts } from '../lib/settlement'
import { formatSettlementRecap } from '../lib/recapText'
import { getPeriodRange, filterByDateRange } from '../lib/timeRange'
import { useClickOutside } from '../lib/useClickOutside'
import { useCurrency } from '../context/CurrencyContext'
import SettlementSummary from '../components/SettlementSummary'
import ShareButton from '../components/ShareButton'
import InviteMenu from '../components/InviteMenu'
import Pagination from '../components/Pagination'
import { PrintableSettlementRecap } from '../components/PrintableRecap'

const BILLS_PAGE_SIZE = 15

export default function GroupView() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const { format } = useCurrency()

  const [group, setGroup] = useState(null)
  const [allMembers, setAllMembers] = useState([])
  const [showMembers, setShowMembers] = useState(false)
  const memberPopoverRef = useRef(null)
  useClickOutside(memberPopoverRef, () => setShowMembers(false), showMembers)
  const [bills, setBills] = useState(null)
  const [billsPage, setBillsPage] = useState(0)
  const [newBillTitle, setNewBillTitle] = useState('')
  const [settlement, setSettlement] = useState(null)
  const [weekTotal, setWeekTotal] = useState(0)
  const [monthTotal, setMonthTotal] = useState(0)
  const [payments, setPayments] = useState([])
  const [error, setError] = useState(null)

  const activeMembers = allMembers.filter((m) => m.active)
  // My own participant row in this group — bills/items/payments reference
  // group_members.id now, not the raw account ID, so anything I create
  // needs this resolved first (e.g. defaulting a new bill's payer to me).
  const myParticipantId = allMembers.find((m) => m.userId === user.id)?.id

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
    const { data: rawBillsData } = await supabase
      .from('bills')
      .select('id, paid_by, created_at, items(id, total_price, item_shares(member_id, shares)), bill_payers(member_id, amount)')
      .eq('group_id', groupId)

    const { data: paymentsData } = await supabase
      .from('payments')
      .select('id, from_member, to_member, amount, created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })

    setPayments(paymentsData || [])

    if (!rawBillsData) return

    // computeBalances/computeSpendingTotals expect a bill's multi-payer
    // split (if any) as .payers — renamed from Supabase's nested
    // bill_payers here at the query boundary, same spirit as the
    // item_shares -> user_id remap just below.
    const billsData = rawBillsData.map((b) => ({ ...b, payers: b.bill_payers || [] }))

    const items = []
    const itemShares = []
    for (const bill of billsData) {
      for (const item of bill.items || []) {
        items.push({ id: item.id, bill_id: bill.id, total_price: item.total_price })
        for (const share of item.item_shares || []) {
          itemShares.push({ item_id: item.id, user_id: share.member_id, shares: share.shares })
        }
      }
    }

    // Reuses the same fetch for the quick weekly/monthly preview at the
    // bottom of the page, rather than firing off a second round-trip for
    // numbers this data already contains.
    const thisWeek = getPeriodRange('week', 0)
    const thisMonth = getPeriodRange('month', 0)
    const weekBills = filterByDateRange(billsData, items, [], thisWeek.start, thisWeek.end)
    const monthBills = filterByDateRange(billsData, items, [], thisMonth.start, thisMonth.end)
    setWeekTotal(weekBills.items.reduce((sum, it) => sum + Number(it.total_price), 0))
    setMonthTotal(monthBills.items.reduce((sum, it) => sum + Number(it.total_price), 0))

    // computeBalances/simplifyDebts operate on a generic "userId" key — it's
    // always been just an opaque ID as far as they're concerned, so feeding
    // them group_members.id values (real accounts and guests alike) needs
    // no changes there, only here at the query/mapping boundary.
    const paymentsForBalances = (paymentsData || []).map((p) => ({
      from_user: p.from_member,
      to_user: p.to_member,
      amount: p.amount,
    }))

    const balances = computeBalances({ bills: billsData, items, itemShares, payments: paymentsForBalances })
    setSettlement(simplifyDebts(balances))
  }, [groupId])

  useEffect(() => {
    if (!bills) return
    const maxPage = Math.max(0, Math.ceil(bills.length / BILLS_PAGE_SIZE) - 1)
    if (billsPage > maxPage) setBillsPage(maxPage)
  }, [bills, billsPage])

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
        paid_by: myParticipantId,
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

  async function recordPayment(fromMemberId, toMemberId, amount) {
    if (!fromMemberId || !toMemberId || fromMemberId === toMemberId || !amount) return
    setError(null)
    const { error: paymentError } = await supabase.from('payments').insert({
      group_id: groupId,
      from_member: fromMemberId,
      to_member: toMemberId,
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
        <InviteMenu
          inviteUrl={group ? `${window.location.origin}/join/${group.invite_code}` : ''}
          groupName={group?.name}
        />
        <div className="member-count-wrap" ref={memberPopoverRef}>
          <button type="button" className="member-count-btn" onClick={() => setShowMembers((s) => !s)}>
            {activeMembers.length} {activeMembers.length === 1 ? 'person' : 'people'}
          </button>
          {showMembers && (
            <div className="member-count-popover">
              <ul>
                {activeMembers.map((m) => (
                  <li key={m.id}>
                    {m.name}
                    {m.isGuest && <span className="muted"> (guest)</span>}
                  </li>
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
      <Link to={`/groups/${groupId}/import`} className="btn-link import-link">
        Import bills from Splitwise (CSV)
      </Link>

      {bills?.length === 0 && (
        <p className="empty-state">No bills yet. Start one above, then scan or add a receipt.</p>
      )}

      <ul className="card-list">
        {bills?.slice(billsPage * BILLS_PAGE_SIZE, (billsPage + 1) * BILLS_PAGE_SIZE).map((bill) => (
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
      <Pagination page={billsPage} setPage={setBillsPage} totalItems={bills?.length || 0} pageSize={BILLS_PAGE_SIZE} />

      {error && <p className="status-error">{error}</p>}

      <SettlementSummary
        transactions={settlement}
        members={allMembers}
        payments={payments}
        onRecordPayment={recordPayment}
        onDeletePayment={deletePayment}
      />

      {settlement && (
        <div className="recap-actions">
          <ShareButton
            label="Share settle-up"
            title={`Settle up — ${group?.name}`}
            getText={() => formatSettlementRecap(group?.name, settlement, allMembers, format)}
          />
          <button type="button" className="btn-secondary" onClick={() => window.print()}>
            Download PDF
          </button>
        </div>
      )}
      <PrintableSettlementRecap groupName={group?.name} transactions={settlement} members={allMembers} />

      <h2 className="settings-section-title group-stats-preview-title">Quick stats</h2>
      <div className="stats-summary">
        <div className="stats-summary-item">
          <span className="stats-summary-value mono">{format(weekTotal)}</span>
          <span className="muted">this week</span>
        </div>
        <div className="stats-summary-item">
          <span className="stats-summary-value mono">{format(monthTotal)}</span>
          <span className="muted">this month</span>
        </div>
      </div>
      <Link to={`/groups/${groupId}/stats`} className="btn-link">
        See full stats →
      </Link>
    </div>
  )
}
