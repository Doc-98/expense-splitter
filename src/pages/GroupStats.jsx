import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { fetchAllGroupMembers } from '../lib/members'
import { computeSpendingTotals } from '../lib/settlement'
import { getPeriodRange, filterByDateRange } from '../lib/timeRange'
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

export default function GroupStats() {
  const { groupId } = useParams()

  const [members, setMembers] = useState([])
  const [rawBills, setRawBills] = useState([])
  const [rawItems, setRawItems] = useState([])
  const [rawShares, setRawShares] = useState([])
  const [granularity, setGranularity] = useState('all')
  const [offset, setOffset] = useState(0)

  const nameOf = (id) => members.find((m) => m.id === id)?.name || 'Someone'

  const load = useCallback(async () => {
    setMembers(await fetchAllGroupMembers(groupId))

    const { data: billsData } = await supabase
      .from('bills')
      .select('id, title, created_at, paid_by, items(id, total_price, item_shares(user_id, shares))')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true })

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
    setRawBills(list.map((b) => ({ id: b.id, title: b.title, created_at: b.created_at, paid_by: b.paid_by })))
    setRawItems(items)
    setRawShares(itemShares)
  }, [groupId])

  useEffect(() => {
    load()
  }, [load])

  const { start, end, label } = getPeriodRange(granularity, offset)
  const { bills, items, itemShares } = filterByDateRange(rawBills, rawItems, rawShares, start, end)
  const totals = computeSpendingTotals({ bills, items, itemShares })

  const billTotals = bills.map((b) => ({
    id: b.id,
    title: b.title,
    created_at: b.created_at,
    paid_by: b.paid_by,
    total: items.filter((it) => it.bill_id === b.id).reduce((sum, it) => sum + Number(it.total_price), 0),
  }))

  const groupTotal = billTotals.reduce((sum, b) => sum + b.total, 0)
  const billCount = billTotals.length
  const avgBill = billCount ? groupTotal / billCount : 0

  // A month-by-month breakdown only makes sense when the view already spans
  // multiple months — showing it while already looking at a single week or
  // month would just be one lonely bar.
  const showMonthly = granularity === 'all' || granularity === 'year'
  const monthly = {}
  for (const b of billTotals) {
    const key = monthKey(b.created_at)
    monthly[key] = (monthly[key] || 0) + b.total
  }
  const monthlyRows = Object.entries(monthly).sort(([a], [b]) => (a > b ? -1 : 1))
  const maxMonthly = Math.max(1, ...monthlyRows.map(([, v]) => v))

  const biggestBills = [...billTotals].sort((a, b) => b.total - a.total).slice(0, 5)

  const peopleWithData = members.filter((m) => totals[m.id])

  return (
    <div className="page">
      <header className="page-header">
        <Link to={`/groups/${groupId}`} className="btn-link">
          ← Back
        </Link>
        <h1>Stats</h1>
      </header>

      <TimeRangeSelector
        granularity={granularity}
        setGranularity={setGranularity}
        offset={offset}
        setOffset={setOffset}
        label={label}
      />

      <div className="stats-summary">
        <div className="stats-summary-item">
          <span className="stats-summary-value mono">€{groupTotal.toFixed(2)}</span>
          <span className="muted">total spent</span>
        </div>
        <div className="stats-summary-item">
          <span className="stats-summary-value mono">{billCount}</span>
          <span className="muted">bills</span>
        </div>
        <div className="stats-summary-item">
          <span className="stats-summary-value mono">€{avgBill.toFixed(2)}</span>
          <span className="muted">avg. bill</span>
        </div>
      </div>

      <h2 className="settings-section-title">By person</h2>
      {peopleWithData.length === 0 && <p className="empty-state">No spending recorded for this period.</p>}
      {peopleWithData.length > 0 && (
        <table className="stats-table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Fronted</th>
              <th>Their share</th>
            </tr>
          </thead>
          <tbody>
            {peopleWithData.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.name}
                  {!m.active && <span className="muted"> (left)</span>}
                </td>
                <td className="mono">€{(totals[m.id]?.paid || 0).toFixed(2)}</td>
                <td className="mono">€{(totals[m.id]?.consumed || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted stats-note">
        "Fronted" is what they've paid at checkout. "Their share" is what they've actually consumed —
        these rarely match, that gap is exactly what the settle-up on the group page is for.
      </p>

      {showMonthly && monthlyRows.length > 0 && (
        <>
          <h2 className="settings-section-title">By month</h2>
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

      {biggestBills.length > 0 && (
        <>
          <h2 className="settings-section-title">Biggest bills</h2>
          <ul className="settlement-list">
            {biggestBills.map((b) => (
              <li key={b.id}>
                <Link to={`/groups/${groupId}/bills/${b.id}`} className="debtor">
                  {b.title}
                </Link>
                <span className="settlement-verb">paid by {nameOf(b.paid_by)}</span>
                <span className="mono amount">€{b.total.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
