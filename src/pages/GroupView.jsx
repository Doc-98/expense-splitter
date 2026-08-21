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
import { processDueRecurringBills } from '../lib/recurringBills'
import { groupItemsByDate } from '../lib/dateGroups'
import { buildGroupCsvRows, toCsv, downloadCsv } from '../lib/csv'
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
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())

  const activeMembers = allMembers.filter((m) => m.active)
  // Grouped by month/day for the date dividers — only the current page's
  // worth of bills, same slice the flat list used before dividers existed.
  const visibleBills = bills?.slice(billsPage * BILLS_PAGE_SIZE, (billsPage + 1) * BILLS_PAGE_SIZE) || []
  const billGroups = groupItemsByDate(visibleBills)
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

    // Opportunistic, not scheduled — this is what actually generates due
    // recurring bills, running the moment anyone opens the group rather
    // than in the background on their exact due date. A failure here
    // shouldn't break the rest of the page, so it's logged rather than
    // surfaced as a blocking error.
    processDueRecurringBills(supabase, groupId, user.id)
      .then((result) => {
        if (result.created > 0) reloadAll()
      })
      .catch((err) => console.error('Failed to process recurring bills:', err))

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

  // Selection is independent of pagination on purpose — picking bills on
  // page 1, paging over, and picking more on page 2 before deleting all of
  // them together is a reasonable thing to want, so selectedIds isn't reset
  // on page change, only when selection mode itself is toggled off.
  function toggleSelectMode() {
    setSelectMode((v) => !v)
    setSelectedIds(new Set())
  }

  function toggleSelected(billId) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(billId)) next.delete(billId)
      else next.add(billId)
      return next
    })
  }

  async function deleteSelectedBills() {
    const count = selectedIds.size
    if (count === 0) return
    if (!window.confirm(`Delete ${count} bill${count === 1 ? '' : 's'}? This removes all their items too.`)) return
    setError(null)
    const { error: deleteError } = await supabase.from('bills').delete().in('id', Array.from(selectedIds))
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setSelectedIds(new Set())
    setSelectMode(false)
    reloadAll()
  }

  // Fetched fresh on demand rather than kept in page state permanently —
  // the bill list above only ever needs lightweight rows (no items/shares),
  // and an export is infrequent enough that a dedicated round-trip when it's
  // actually clicked is simpler than keeping every bill's full item detail
  // loaded at all times just in case someone exports.
  async function exportGroupCsv() {
    setError(null)
    try {
      const [{ data: billsData, error: billsError }, { data: categoriesData, error: categoriesError }] = await Promise.all([
        supabase
          .from('bills')
          .select(
            'id, title, created_at, paid_by, category_id, items(name, quantity, unit_price, total_price, category_id, item_shares(member_id, shares)), bill_payers(member_id, amount)'
          )
          .eq('group_id', groupId)
          .order('created_at', { ascending: true }),
        supabase.from('categories').select('id, name').eq('group_id', groupId),
      ])
      if (billsError) throw billsError
      if (categoriesError) throw categoriesError

      const bills = (billsData || []).map((b) => ({ ...b, payers: b.bill_payers || [] }))
      const { header, rows } = buildGroupCsvRows(bills, allMembers, categoriesData || [])
      const filename = `${(group?.name || 'group').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-bills.csv`
      downloadCsv(filename, toCsv(header, rows))
    } catch (err) {
      setError(err.message)
    }
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
      <div className="bill-list-controls">
        <Link to={`/groups/${groupId}/recurring`} className="btn-link import-link">
          Recurring bills
        </Link>
        {bills && bills.length > 0 && (
          <button type="button" className="btn-link" onClick={toggleSelectMode}>
            {selectMode ? 'Cancel' : 'Select'}
          </button>
        )}
      </div>

      {selectMode && (
        <div className="bulk-select-bar">
          <span>{selectedIds.size} selected</span>
          <button
            type="button"
            className="btn-danger"
            disabled={selectedIds.size === 0}
            onClick={deleteSelectedBills}
          >
            Delete selected
          </button>
        </div>
      )}

      {bills?.length === 0 && (
        <p className="empty-state">No bills yet. Start one above, then scan or add a receipt.</p>
      )}

      {billGroups.map((monthGroup) => (
        <div key={monthGroup.key}>
          <h3 className="bill-month-divider">{monthGroup.label}</h3>
          {monthGroup.days.map((dayGroup) => (
            <div key={dayGroup.key}>
              <div className="bill-day-divider">{dayGroup.label}</div>
              <ul className="card-list">
                {dayGroup.items.map((bill) => {
                  const billLabel = (
                    <span className="card-list-item-main">
                      <span>{bill.title}</span>
                      {bill.note && <span className="card-list-item-note">{bill.note}</span>}
                    </span>
                  )
                  return (
                    <li key={bill.id} className="bill-list-item">
                      {selectMode ? (
                        <label className="card-list-item bill-select-row">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(bill.id)}
                            onChange={() => toggleSelected(bill.id)}
                          />
                          {billLabel}
                        </label>
                      ) : (
                        <>
                          <Link to={`/groups/${groupId}/bills/${bill.id}`} className="card-list-item">
                            {billLabel}
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
                        </>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      ))}
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
          {bills && bills.length > 0 && (
            <>
              <span className="recap-divider" />
              <button type="button" className="btn-secondary" onClick={exportGroupCsv}>
                Export CSV
              </button>
            </>
          )}
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
      <Link to={`/groups/${groupId}/stats`} className="btn-link see-stats-link">
        See full stats →
      </Link>
    </div>
  )
}
