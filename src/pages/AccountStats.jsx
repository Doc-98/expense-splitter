import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../context/CurrencyContext'
import { computeBalances, computeSpendingTotals } from '../lib/settlement'
import { computeMyCategorySpend } from '../lib/categoryStats'
import { mergeCategoriesByName } from '../lib/categories'
import { fetchThresholds } from '../lib/thresholds'
import { getPeriodRange, filterByDateRange, sumDailyInRange, monthlyFromDaily } from '../lib/timeRange'
import TimeRangeSelector from '../components/TimeRangeSelector'

function monthKey(dateStr) {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key) {
  const [year, month] = key.split('-')
  const d = new Date(Number(year), Number(month) - 1, 1)
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export default function AccountStats() {
  const { user } = useAuth()
  const { format } = useCurrency()

  const [groups, setGroups] = useState([]) // currently active groups: [{ id, name }]
  // My own participant ID is a *different* group_members.id in every group
  // now (bills/items/payments reference that, not the account ID directly)
  // — so "which row is me" has to be looked up per group, not assumed to
  // be a single constant the way user.id used to be.
  const [myParticipantByGroup, setMyParticipantByGroup] = useState(new Map())
  const [rawBills, setRawBills] = useState([]) // includes group_id
  const [rawItems, setRawItems] = useState([])
  const [rawShares, setRawShares] = useState([])
  const [rawCategories, setRawCategories] = useState([]) // every category across all my active groups
  const [thresholds, setThresholds] = useState([])
  const [snapshots, setSnapshots] = useState([]) // departed groups' frozen records
  const [overallBalance, setOverallBalance] = useState(0)
  const [granularity, setGranularity] = useState('all')
  const [offset, setOffset] = useState(0)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const { data: memberRows } = await supabase
      .from('group_members')
      .select('id, group_id')
      .eq('user_id', user.id)
      .eq('active', true)

    const groupIds = (memberRows || []).map((r) => r.group_id)
    const participantByGroup = new Map((memberRows || []).map((r) => [r.group_id, r.id]))
    setMyParticipantByGroup(participantByGroup)

    const { data: groupsData } = groupIds.length
      ? await supabase.from('groups').select('id, name').in('id', groupIds)
      : { data: [] }
    setGroups(groupsData || [])

    const { data: rawBillsData } = groupIds.length
      ? await supabase
          .from('bills')
          .select(
            'id, group_id, title, created_at, paid_by, category_id, items(id, total_price, category_id, item_shares(member_id, shares)), bill_payers(member_id, amount)'
          )
          .in('group_id', groupIds)
      : { data: [] }

    const list = (rawBillsData || []).map((b) => ({ ...b, payers: b.bill_payers || [] }))
    const items = []
    const itemShares = []
    for (const bill of list) {
      for (const item of bill.items || []) {
        items.push({ id: item.id, bill_id: bill.id, total_price: item.total_price, category_id: item.category_id })
        for (const share of item.item_shares || []) {
          itemShares.push({ item_id: item.id, user_id: share.member_id, shares: share.shares })
        }
      }
    }
    setRawBills(
      list.map((b) => ({
        id: b.id,
        group_id: b.group_id,
        title: b.title,
        created_at: b.created_at,
        paid_by: b.paid_by,
        category_id: b.category_id,
        payers: b.payers,
      }))
    )
    setRawItems(items)
    setRawShares(itemShares)

    // For the "Spending thresholds" section below — every category across
    // every group I'm in (so same-named tags from different groups can be
    // merged, see mergeCategoriesByName), plus my own saved threshold
    // amounts. Neither is scoped to whatever period the rest of this page
    // is showing — thresholds are always compared against the current
    // calendar month specifically (see Thresholds.jsx for why).
    const { data: categoriesData } = groupIds.length
      ? await supabase.from('categories').select('id, name, color').in('group_id', groupIds).order('created_at', { ascending: true })
      : { data: [] }
    setRawCategories(categoriesData || [])
    setThresholds(await fetchThresholds(user.id))

    // Departed groups' frozen records — a group you're back in shouldn't
    // also show a stale snapshot, live data already covers it fully.
    const { data: snapshotData } = await supabase
      .from('departure_snapshots')
      .select('*')
      .eq('user_id', user.id)
    setSnapshots((snapshotData || []).filter((s) => !groupIds.includes(s.group_id)))

    // Overall balance is a running, "right now" figure — it isn't scoped to
    // whatever time period is selected below. It's the live balance from
    // every group you're still in, plus any not-yet-settled balance frozen
    // from groups you've left.
    const { data: paymentsData } = groupIds.length
      ? await supabase.from('payments').select('id, group_id, from_member, to_member, amount').in('group_id', groupIds)
      : { data: [] }

    let balanceSum = 0
    for (const groupId of groupIds) {
      const myId = participantByGroup.get(groupId)
      const groupBills = list.filter((b) => b.group_id === groupId)
      const groupItems = items.filter((it) => groupBills.some((b) => b.id === it.bill_id))
      const groupShares = itemShares.filter((s) => groupItems.some((it) => it.id === s.item_id))
      const groupPayments = (paymentsData || [])
        .filter((p) => p.group_id === groupId)
        .map((p) => ({ from_user: p.from_member, to_user: p.to_member, amount: p.amount }))
      const balances = computeBalances({
        bills: groupBills,
        items: groupItems,
        itemShares: groupShares,
        payments: groupPayments,
      })
      balanceSum += balances[myId] || 0
    }
    for (const snap of (snapshotData || []).filter((s) => !groupIds.includes(s.group_id))) {
      if (!snap.balance_settled) balanceSum += Number(snap.balance)
    }
    setOverallBalance(Math.round(balanceSum * 100) / 100)
  }, [user.id])

  useEffect(() => {
    load()
  }, [load])

  const { start, end, label } = getPeriodRange(granularity, offset)
  const { bills, items, itemShares } = filterByDateRange(rawBills, rawItems, rawShares, start, end)

  // Spending thresholds are always compared against the current calendar
  // month specifically, independent of whatever period this page's own
  // selector is showing above (see Thresholds.jsx for why) — a separate,
  // fixed date range from the granularity/offset-driven one above.
  const thisMonth = getPeriodRange('month', 0)
  const monthFiltered = filterByDateRange(rawBills, rawItems, rawShares, thisMonth.start, thisMonth.end)
  const myParticipantIds = new Set(myParticipantByGroup.values())
  const categoryNameById = new Map(rawCategories.map((c) => [c.id, c.name]))
  const categoryColorByKey = new Map(mergeCategoriesByName(rawCategories).map((c) => [c.name.toLowerCase(), c.color]))
  const myCategorySpend = computeMyCategorySpend({
    bills: monthFiltered.bills,
    items: monthFiltered.items,
    itemShares: monthFiltered.itemShares,
    myParticipantIds,
    categoryNameById,
  })
  const thresholdRows = thresholds
    .map((t) => {
      const key = t.category_name.trim().toLowerCase()
      const spent = myCategorySpend[key]?.amount || 0
      const amount = Number(t.amount)
      return {
        key,
        name: t.category_name,
        color: categoryColorByKey.get(key) || '#999999',
        spent,
        amount,
        over: spent > amount,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const showMonthly = granularity === 'all' || granularity === 'year'
  const monthly = {}
  for (const b of bills) {
    // Only counts bills *you* fronted — has to match what a departed
    // group's snapshot can supply below (just your own portion, by design),
    // or the chart would silently mix "everyone's spending" with "just my
    // spending" depending on whether a group happens to still be live.
    // On a multi-payer bill, "you fronted" means your own entry in
    // b.payers, not the bill's paid_by (which is null once a bill has any
    // payers rows at all).
    const myId = myParticipantByGroup.get(b.group_id)
    let myContribution = 0
    if (b.payers && b.payers.length > 0) {
      const mine = b.payers.find((p) => p.member_id === myId)
      if (mine) myContribution = Number(mine.amount)
    } else if (b.paid_by === myId) {
      myContribution = items.filter((it) => it.bill_id === b.id).reduce((sum, it) => sum + Number(it.total_price), 0)
    }
    if (myContribution <= 0) continue
    const key = monthKey(b.created_at)
    monthly[key] = (monthly[key] || 0) + myContribution
  }
  for (const s of snapshots) {
    for (const [key, value] of Object.entries(monthlyFromDaily(s.daily_totals))) {
      monthly[key] = (monthly[key] || 0) + value
    }
  }
  const monthlyRows = Object.entries(monthly).sort(([a], [b]) => (a > b ? -1 : 1))
  const maxMonthly = Math.max(1, ...monthlyRows.map(([, v]) => v))

  const activeGroupRows = groups.map((g) => {
    const myId = myParticipantByGroup.get(g.id)
    const groupBills = bills.filter((b) => b.group_id === g.id)
    const groupBillIds = new Set(groupBills.map((b) => b.id))
    const groupItems = items.filter((it) => groupBillIds.has(it.bill_id))
    const groupItemIds = new Set(groupItems.map((it) => it.id))
    const groupShares = itemShares.filter((s) => groupItemIds.has(s.item_id))
    const totals = computeSpendingTotals({ bills: groupBills, items: groupItems, itemShares: groupShares })[myId] || {
      paid: 0,
      consumed: 0,
    }
    return { id: g.id, name: g.name, left: false, ...totals }
  })

  const departedGroupRows = snapshots
    .map((s) => {
      const t = sumDailyInRange(s.daily_totals, start, end)
      return {
        id: s.group_id,
        snapshotId: s.id,
        name: s.group_name,
        left: true,
        balance: Number(s.balance),
        balanceSettled: s.balance_settled,
        ...t,
      }
    })
    .filter((g) => granularity === 'all' || g.paid > 0 || g.consumed > 0)

  const byGroup = [...activeGroupRows, ...departedGroupRows]

  // Rather than a separate merged computation across every group at once
  // (which can't work now — "my ID" differs per group, so there's no
  // single key to look up in a pooled result), the top summary is just the
  // sum of the already-correct, per-group rows above.
  const myTotals = byGroup.reduce(
    (acc, g) => ({ paid: acc.paid + g.paid, consumed: acc.consumed + g.consumed }),
    { paid: 0, consumed: 0 }
  )
  myTotals.paid = Math.round(myTotals.paid * 100) / 100
  myTotals.consumed = Math.round(myTotals.consumed * 100) / 100

  async function markSettled(snapshotId) {
    const { error: settleError } = await supabase
      .from('departure_snapshots')
      .update({ balance_settled: true })
      .eq('id', snapshotId)
    if (settleError) {
      setError(settleError.message)
    } else {
      load()
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <Link to="/" className="btn-link">
          ← Groups
        </Link>
        <h1>Your stats</h1>
      </header>

      {groups.length === 0 && snapshots.length === 0 ? (
        <p className="empty-state">Join or create a group to start seeing your stats.</p>
      ) : (
        <>
          <TimeRangeSelector
            granularity={granularity}
            setGranularity={setGranularity}
            offset={offset}
            setOffset={setOffset}
            label={label}
          />

          <div className="stats-summary">
            <div className="stats-summary-item">
              <span className="stats-summary-value mono">{format(myTotals.paid)}</span>
              <span className="muted">you fronted</span>
            </div>
            <div className="stats-summary-item">
              <span className="stats-summary-value mono">{format(myTotals.consumed)}</span>
              <span className="muted">your share</span>
            </div>
            <div className="stats-summary-item">
              <span className={`stats-summary-value mono ${overallBalance < 0 ? 'balance-negative' : 'balance-positive'}`}>
                {overallBalance >= 0 ? '+' : ''}
                {format(overallBalance)}
              </span>
              <span className="muted">overall balance (now)</span>
            </div>
          </div>
          <p className="muted stats-note">
            The first two numbers are for the period selected above, and include groups you've since
            left. Overall balance is always right-now, not scoped to a time period — including any
            not-yet-settled balance frozen from a group you've left.
          </p>

          {thresholdRows.length > 0 && (
            <>
              <h2 className="settings-section-title">Spending thresholds</h2>
              <div className="stats-bars">
                {thresholdRows.map((t) => (
                  <div key={t.key} className="stats-bar-row">
                    <span className="stats-bar-label">
                      <span className="category-dot" style={{ background: t.color }} />
                      {t.name}
                    </span>
                    <div className="stats-bar-track">
                      <div
                        className={`stats-bar-fill ${t.over ? 'over-budget' : ''}`}
                        style={{
                          width: `${Math.min(100, (t.spent / t.amount) * 100)}%`,
                          background: t.over ? undefined : t.color,
                        }}
                      />
                    </div>
                    <span className={`mono threshold-bar-value ${t.over ? 'balance-negative' : ''}`}>
                      {format(t.spent)} / {format(t.amount)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="muted stats-note">
                Always this calendar month, and always your own share — not scoped to the period
                selected above.{' '}
                <Link to="/thresholds">Manage thresholds →</Link>
              </p>
            </>
          )}

          <h2 className="settings-section-title">By group</h2>
          <table className="stats-table">
            <thead>
              <tr>
                <th>Group</th>
                <th>Fronted</th>
                <th>Your share</th>
              </tr>
            </thead>
            <tbody>
              {byGroup.map((g) => (
                <tr key={g.id}>
                  <td>
                    {g.left ? (
                      <span className="muted">{g.name} (left)</span>
                    ) : (
                      <Link to={`/groups/${g.id}/stats`}>{g.name}</Link>
                    )}
                    {g.left && !g.balanceSettled && Math.abs(g.balance) > 0.01 && (
                      <>
                        <span className={`stale-balance mono ${g.balance < 0 ? 'balance-negative' : 'balance-positive'}`}>
                          {g.balance >= 0 ? '+' : ''}
                          {format(g.balance)} left unsettled
                        </span>
                        <button type="button" className="btn-link" onClick={() => markSettled(g.snapshotId)}>
                          Mark settled
                        </button>
                      </>
                    )}
                  </td>
                  <td className="mono">{format(g.paid)}</td>
                  <td className="mono">{format(g.consumed)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {error && <p className="status-error">{error}</p>}

          {showMonthly && monthlyRows.length > 0 && (
            <>
              <h2 className="settings-section-title">By month (fronted)</h2>
              <div className="stats-bars">
                {monthlyRows.map(([key, value]) => (
                  <div key={key} className="stats-bar-row">
                    <span className="stats-bar-label">{monthLabel(key)}</span>
                    <div className="stats-bar-track">
                      <div className="stats-bar-fill" style={{ width: `${(value / maxMonthly) * 100}%` }} />
                    </div>
                    <span className="mono stats-bar-value">{format(value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
