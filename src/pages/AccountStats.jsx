import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { computeBalances, computeSpendingTotals } from '../lib/settlement'
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

  const [groups, setGroups] = useState([]) // currently active groups: [{ id, name }]
  const [rawBills, setRawBills] = useState([]) // includes group_id
  const [rawItems, setRawItems] = useState([])
  const [rawShares, setRawShares] = useState([])
  const [snapshots, setSnapshots] = useState([]) // departed groups' frozen records
  const [overallBalance, setOverallBalance] = useState(0)
  const [granularity, setGranularity] = useState('all')
  const [offset, setOffset] = useState(0)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const { data: memberRows } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id)
      .eq('active', true)

    const groupIds = (memberRows || []).map((r) => r.group_id)

    const { data: groupsData } = groupIds.length
      ? await supabase.from('groups').select('id, name').in('id', groupIds)
      : { data: [] }
    setGroups(groupsData || [])

    const { data: billsData } = groupIds.length
      ? await supabase
          .from('bills')
          .select('id, group_id, title, created_at, paid_by, items(id, total_price, item_shares(user_id, shares))')
          .in('group_id', groupIds)
      : { data: [] }

    const list = billsData || []
    const items = []
    const itemShares = []
    for (const bill of list) {
      for (const item of bill.items || []) {
        items.push({ id: item.id, bill_id: bill.id, total_price: item.total_price })
        for (const share of item.item_shares || []) {
          itemShares.push({ item_id: item.id, user_id: share.user_id, shares: share.shares })
        }
      }
    }
    setRawBills(
      list.map((b) => ({ id: b.id, group_id: b.group_id, title: b.title, created_at: b.created_at, paid_by: b.paid_by }))
    )
    setRawItems(items)
    setRawShares(itemShares)

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
      ? await supabase.from('payments').select('id, group_id, from_user, to_user, amount').in('group_id', groupIds)
      : { data: [] }

    let balanceSum = 0
    for (const groupId of groupIds) {
      const groupBills = list.filter((b) => b.group_id === groupId)
      const groupItems = items.filter((it) => groupBills.some((b) => b.id === it.bill_id))
      const groupShares = itemShares.filter((s) => groupItems.some((it) => it.id === s.item_id))
      const groupPayments = (paymentsData || []).filter((p) => p.group_id === groupId)
      const balances = computeBalances({
        bills: groupBills,
        items: groupItems,
        itemShares: groupShares,
        payments: groupPayments,
      })
      balanceSum += balances[user.id] || 0
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

  const liveTotals = computeSpendingTotals({ bills, items, itemShares })[user.id] || { paid: 0, consumed: 0 }
  const snapshotTotals = snapshots.reduce(
    (acc, s) => {
      const t = sumDailyInRange(s.daily_totals, start, end)
      return { paid: acc.paid + t.paid, consumed: acc.consumed + t.consumed }
    },
    { paid: 0, consumed: 0 }
  )
  const myTotals = {
    paid: Math.round((liveTotals.paid + snapshotTotals.paid) * 100) / 100,
    consumed: Math.round((liveTotals.consumed + snapshotTotals.consumed) * 100) / 100,
  }

  const showMonthly = granularity === 'all' || granularity === 'year'
  const monthly = {}
  for (const b of bills) {
    // Only counts bills *you* fronted — has to match what a departed
    // group's snapshot can supply below (just your own portion, by design),
    // or the chart would silently mix "everyone's spending" with "just my
    // spending" depending on whether a group happens to still be live.
    if (b.paid_by !== user.id) continue
    const billTotal = items.filter((it) => it.bill_id === b.id).reduce((sum, it) => sum + Number(it.total_price), 0)
    const key = monthKey(b.created_at)
    monthly[key] = (monthly[key] || 0) + billTotal
  }
  for (const s of snapshots) {
    for (const [key, value] of Object.entries(monthlyFromDaily(s.daily_totals))) {
      monthly[key] = (monthly[key] || 0) + value
    }
  }
  const monthlyRows = Object.entries(monthly).sort(([a], [b]) => (a > b ? -1 : 1))
  const maxMonthly = Math.max(1, ...monthlyRows.map(([, v]) => v))

  const activeGroupRows = groups.map((g) => {
    const groupBills = bills.filter((b) => b.group_id === g.id)
    const groupBillIds = new Set(groupBills.map((b) => b.id))
    const groupItems = items.filter((it) => groupBillIds.has(it.bill_id))
    const groupItemIds = new Set(groupItems.map((it) => it.id))
    const groupShares = itemShares.filter((s) => groupItemIds.has(s.item_id))
    const totals = computeSpendingTotals({ bills: groupBills, items: groupItems, itemShares: groupShares })[user.id] || {
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
              <span className="stats-summary-value mono">€{myTotals.paid.toFixed(2)}</span>
              <span className="muted">you fronted</span>
            </div>
            <div className="stats-summary-item">
              <span className="stats-summary-value mono">€{myTotals.consumed.toFixed(2)}</span>
              <span className="muted">your share</span>
            </div>
            <div className="stats-summary-item">
              <span className={`stats-summary-value mono ${overallBalance < 0 ? 'balance-negative' : 'balance-positive'}`}>
                {overallBalance >= 0 ? '+' : ''}
                €{overallBalance.toFixed(2)}
              </span>
              <span className="muted">overall balance (now)</span>
            </div>
          </div>
          <p className="muted stats-note">
            The first two numbers are for the period selected above, and include groups you've since
            left. Overall balance is always right-now, not scoped to a time period — including any
            not-yet-settled balance frozen from a group you've left.
          </p>

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
                          €{g.balance.toFixed(2)} left unsettled
                        </span>
                        <button type="button" className="btn-link" onClick={() => markSettled(g.snapshotId)}>
                          Mark settled
                        </button>
                      </>
                    )}
                  </td>
                  <td className="mono">€{g.paid.toFixed(2)}</td>
                  <td className="mono">€{g.consumed.toFixed(2)}</td>
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
                    <span className="mono stats-bar-value">€{value.toFixed(2)}</span>
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
