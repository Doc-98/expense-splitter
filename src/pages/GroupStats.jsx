import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { fetchAllGroupMembers } from '../lib/members'
import { fetchCategories } from '../lib/categories'
import { fetchAllRows } from '../lib/fetchAllRows'
import { loadErrorMessage } from '../lib/loadErrorMessage'
import { groupStatsCache } from '../lib/groupStatsCache'
import { computeSpendingTotals } from '../lib/settlement'
import { computeCategoryTotals } from '../lib/categoryStats'
import { getPeriodRange, filterByDateRange } from '../lib/timeRange'
import { comparePeriods } from '../lib/periodComparison'
import { getStatsPreferences, setStatsPreferences } from '../lib/statsPreferences'
import { useCurrency } from '../context/CurrencyContext'
import TimeRangeSelector from '../components/TimeRangeSelector'
import ComparisonBadge from '../components/ComparisonBadge'

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
  const { format } = useCurrency()

  const [members, setMembers] = useState([])
  const [categories, setCategories] = useState([])
  const [rawBills, setRawBills] = useState([])
  const [rawItems, setRawItems] = useState([])
  const [rawShares, setRawShares] = useState([])
  // Same shared, per-device preference Your Stats reads/writes (see
  // src/lib/statsPreferences.js) — deliberately one preference, not a
  // separate one per group: "default period on load" is how you like to
  // look at spending in general, and it should behave identically no
  // matter which stats page you land on.
  const [granularity, setGranularity] = useState(() => getStatsPreferences().defaultGranularity)
  const [offset, setOffset] = useState(0)
  // Separate from `granularity` above (which changes as you browse around)
  // so the TimeRangeSelector outline can move the instant "Set as default"
  // is clicked, without needing a reload to reflect the new saved value —
  // same reasoning as AccountStats.jsx.
  const [defaultGranularity, setDefaultGranularity] = useState(() => getStatsPreferences().defaultGranularity)
  const [error, setError] = useState(null)

  const nameOf = (id) => members.find((m) => m.id === id)?.name || 'Someone'

  function handleSetDefaultGranularity(g) {
    setStatsPreferences({ defaultGranularity: g })
    setDefaultGranularity(g)
  }

  // A failed fetch here used to just leave every number on this page at its
  // initial empty-array default — indistinguishable from "this group
  // genuinely has no bills for that period." Now it surfaces instead, and
  // the bills query is paged through fetchAllRows rather than asked for in
  // one shot, since a group with a big imported history can have thousands
  // of bills — exactly the kind of request that's prone to silently timing
  // out before this had any error handling to catch it.
  const load = useCallback(async () => {
    try {
      setMembers(await fetchAllGroupMembers(groupId))
      setCategories(await fetchCategories(groupId))

      const rawBillsData = await fetchAllRows(() =>
        supabase
          .from('bills')
          .select(
            'id, title, created_at, paid_by, category_id, items(id, total_price, category_id, item_shares(member_id, shares)), bill_payers(member_id, amount)'
          )
          .eq('group_id', groupId)
          .order('created_at', { ascending: true })
      )

      const list = rawBillsData.map((b) => ({ ...b, payers: b.bill_payers || [] }))
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
          title: b.title,
          created_at: b.created_at,
          paid_by: b.paid_by,
          payers: b.payers,
          category_id: b.category_id,
        }))
      )
      setRawItems(items)
      setRawShares(itemShares)
      setError(null)
    } catch (err) {
      setError(loadErrorMessage(err))
    }
  }, [groupId])

  // Same cache-then-revalidate pattern as GroupView.jsx: paint instantly
  // from whatever this group's stats looked like last time this page was
  // open (if anything), then always fetch fresh anyway — a revisit is
  // never worse than today's plain reload, just sometimes faster to first
  // paint. See groupStatsCache.js/lruCache.js for why this is a plain
  // in-memory, session-only cache rather than anything persisted. Depends
  // only on [groupId, load] (not on the state it hydrates) so this fires
  // once per group visit, not every time load() finishes populating that
  // same state — the write-back effect just below is what stays in sync
  // with it on every change instead.
  useEffect(() => {
    const cached = groupStatsCache.get(groupId)
    if (cached) {
      setMembers(cached.members)
      setCategories(cached.categories)
      setRawBills(cached.rawBills)
      setRawItems(cached.rawItems)
      setRawShares(cached.rawShares)
    }
    load()
  }, [groupId, load])

  useEffect(() => {
    if (!members.length) return
    groupStatsCache.set(groupId, { members, categories, rawBills, rawItems, rawShares })
  }, [groupId, members, categories, rawBills, rawItems, rawShares])

  const { start, end, label, yearLabel } = getPeriodRange(granularity, offset)
  const { bills, items, itemShares } = filterByDateRange(rawBills, rawItems, rawShares, start, end)
  const totals = computeSpendingTotals({ bills, items, itemShares })
  const categoryTotals = computeCategoryTotals({ bills, items })

  const billTotals = bills.map((b) => ({
    id: b.id,
    title: b.title,
    created_at: b.created_at,
    paid_by: b.paid_by,
    payers: b.payers,
    total: items.filter((it) => it.bill_id === b.id).reduce((sum, it) => sum + Number(it.total_price), 0),
  }))

  const groupTotal = billTotals.reduce((sum, b) => sum + b.total, 0)
  const billCount = billTotals.length
  const avgBill = billCount ? groupTotal / billCount : 0

  // "Previous period" only means something for week/month/year — there's
  // no period before "all time" to compare against, so the comparison
  // simply doesn't appear in that view rather than showing something
  // meaningless.
  const canCompare = granularity !== 'all'
  let overallComparison = null
  let previousCategoryTotals = {}
  if (canCompare) {
    const previousRange = getPeriodRange(granularity, offset - 1)
    const previousFiltered = filterByDateRange(rawBills, rawItems, rawShares, previousRange.start, previousRange.end)
    const previousGroupTotal = previousFiltered.items.reduce((sum, it) => sum + Number(it.total_price), 0)
    overallComparison = comparePeriods(groupTotal, previousGroupTotal)
    previousCategoryTotals = computeCategoryTotals({ bills: previousFiltered.bills, items: previousFiltered.items })
  }

  const categoryRows = Object.entries(categoryTotals)
    .map(([categoryId, amount]) => ({
      id: categoryId,
      name: categoryId === 'uncategorized' ? 'Uncategorized' : categories.find((c) => c.id === categoryId)?.name || 'Uncategorized',
      color: categories.find((c) => c.id === categoryId)?.color || '#999999',
      amount,
      comparison: canCompare ? comparePeriods(amount, previousCategoryTotals[categoryId] || 0) : null,
    }))
    .sort((a, b) => b.amount - a.amount)
  const maxCategoryAmount = Math.max(1, ...categoryRows.map((c) => c.amount))

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

      {error && <p className="status-error">Couldn't load stats: {error}</p>}

      <TimeRangeSelector
        granularity={granularity}
        setGranularity={setGranularity}
        offset={offset}
        setOffset={setOffset}
        label={label}
        yearLabel={yearLabel}
        defaultGranularity={defaultGranularity}
        onSetDefault={handleSetDefaultGranularity}
      />

      <div className="stats-summary">
        <div className="stats-summary-item">
          <span className="stats-summary-value mono">{format(groupTotal)}</span>
          <span className="muted">total spent</span>
          {overallComparison && <ComparisonBadge comparison={overallComparison} />}
        </div>
        <div className="stats-summary-item">
          <span className="stats-summary-value mono">{billCount}</span>
          <span className="muted">bills</span>
        </div>
        <div className="stats-summary-item">
          <span className="stats-summary-value mono">{format(avgBill)}</span>
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
                  {m.isGuest && <span className="muted"> (guest)</span>}
                  {!m.active && <span className="muted"> (left)</span>}
                </td>
                <td className="mono">{format(totals[m.id]?.paid || 0)}</td>
                <td className="mono">{format(totals[m.id]?.consumed || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted stats-note">
        "Fronted" is what they've paid at checkout. "Their share" is what they've actually consumed —
        these rarely match, that gap is exactly what the settle-up on the group page is for.
      </p>

      {categoryRows.length > 0 && (
        <>
          <h2 className="settings-section-title">By category</h2>
          <div className="stats-bars">
            {categoryRows.map((c) => (
              <div key={c.id} className="stats-bar-group">
                <div className="stats-bar-row">
                  <span className="stats-bar-label">
                    <span className="category-dot" style={{ background: c.color }} />
                    {c.name}
                  </span>
                  <div className="stats-bar-track">
                    <div
                      className="stats-bar-fill"
                      style={{ width: `${(c.amount / maxCategoryAmount) * 100}%`, background: c.color }}
                    />
                  </div>
                  <span className="mono stats-bar-value">{format(c.amount)}</span>
                </div>
                {c.comparison && <ComparisonBadge comparison={c.comparison} />}
              </div>
            ))}
          </div>
        </>
      )}

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
                <span className="mono stats-bar-value">{format(value)}</span>
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
                <span className="settlement-verb">
                  paid by {b.payers?.length > 0 ? b.payers.map((p) => nameOf(p.member_id)).join(', ') : nameOf(b.paid_by)}
                </span>
                <span className="mono amount">{format(b.total)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
