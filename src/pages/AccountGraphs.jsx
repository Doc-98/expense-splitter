import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../context/CurrencyContext'
import { computeDailyTotalsForUser } from '../lib/settlement'
import { mergeCategoriesByName } from '../lib/categories'
import { fetchAllRows } from '../lib/fetchAllRows'
import { loadErrorMessage } from '../lib/loadErrorMessage'
import { deriveBillsItemsShares } from '../lib/deriveBillData'
import { getPeriodRange, getMultiMonthRange, getStatsWindowStart } from '../lib/timeRange'
import { buildSeries } from '../lib/timeSeries'
import GraphsPeriodSelector from '../components/GraphsPeriodSelector'
import LineChart from '../components/LineChart'
import PieChart from '../components/PieChart'

// tab -> the chart's own point granularity — same reasoning (and the same
// reverted-back-to-this-from-finer-points history) as GroupGraphs.jsx's
// own GRANULARITY_BY_TAB.
const GRANULARITY_BY_TAB = { month: 'day', quad: 'month', year: 'month' }

function rangeForTab(tab, offset) {
  if (tab === 'month') return getPeriodRange('month', offset)
  if (tab === 'quad') return getMultiMonthRange(4, offset)
  return getPeriodRange('year', offset)
}

// Same lowercased-trimmed key every other cross-group category merge in
// this app uses (mergeCategoriesByName, computeMyCategorySpend) — a
// "Groceries" in one group and a "groceries" in another are meant to be
// one category, and computeDailyTotalsForUser() itself doesn't normalize
// this (each call only ever sees one group's own casing), so it has to
// happen here instead, or the same category could silently end up as two
// separate line-chart/pie-chart entries depending on which group happened
// to spell it differently.
function categoryKeyFor(name) {
  return name.trim().toLowerCase()
}

// Sums every active group's own computeDailyTotalsForUser() output into one
// combined { dayKey: { total, categories: { categoryKey: amount } } } map —
// each group's "me" is a different group_members.id, so this can't just be
// one combined query, it has to be one call per group, merged after the
// fact. Deliberately normalizes into `.total` (the field buildSeries
// actually reads) here rather than carrying `.consumed` through — a
// *personal* spending chart means "my own share," never "what I fronted,"
// same reasoning the Spending Thresholds budgets already use.
function mergeDailyMaps(perGroupDailies) {
  const merged = {}
  for (const daily of perGroupDailies) {
    for (const [key, bucket] of Object.entries(daily)) {
      if (!merged[key]) merged[key] = { total: 0, categories: {} }
      merged[key].total += bucket.consumed || 0
      for (const [name, amount] of Object.entries(bucket.categories || {})) {
        const categoryKey = categoryKeyFor(name)
        merged[key].categories[categoryKey] = (merged[key].categories[categoryKey] || 0) + amount
      }
    }
  }
  for (const key of Object.keys(merged)) {
    merged[key].total = Math.round(merged[key].total * 100) / 100
    for (const categoryKey of Object.keys(merged[key].categories)) {
      merged[key].categories[categoryKey] = Math.round(merged[key].categories[categoryKey] * 100) / 100
    }
  }
  return merged
}

export default function AccountGraphs() {
  const { user } = useAuth()
  const { format } = useCurrency()

  const [rawCategories, setRawCategories] = useState([]) // every category across every active group, own id/color kept
  const [perGroupData, setPerGroupData] = useState([]) // [{ myId, bills, items, itemShares }]
  // Departed groups' frozen daily_totals — already in the exact
  // { dayKey: { consumed, categories: { name: amount } } } shape
  // computeDailyTotalsForUser() itself produces (see settlement.js), so no
  // separate merge path is needed for these; they fold into the same
  // mergeDailyMaps() call as every live group's own output.
  const [snapshots, setSnapshots] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [windowStart, setWindowStart] = useState(null)
  // Same three-state convention as GroupGraphs.jsx/GroupStats.jsx — only
  // covers the live-bills backfill below; snapshots are always fetched in
  // full up front (there's only ever one small row per departed group, no
  // windowing needed), same as AccountStats.jsx treats them.
  const [historyStatus, setHistoryStatus] = useState('loading')

  const [tab, setTab] = useState('year')
  const [offset, setOffset] = useState(0)
  // A lowercased-trimmed category key (see categoryKeyFor above, matching
  // how `daily.categories` and mergedCategories both key by it), or '' for
  // every category combined.
  const [categoryFilter, setCategoryFilter] = useState('')

  const BILLS_SELECT =
    'id, group_id, created_at, category_id, items(id, total_price, category_id, item_shares(member_id, shares))'

  function deriveByGroup(rawBills, groupIds, participantByGroup) {
    const { list, items, itemShares } = deriveBillsItemsShares(rawBills)
    return groupIds.map((groupId) => {
      const myId = participantByGroup.get(groupId)
      const groupBills = list.filter((b) => b.group_id === groupId)
      const groupItems = items.filter((it) => groupBills.some((b) => b.id === it.bill_id))
      const groupShares = itemShares.filter((s) => groupItems.some((it) => it.id === s.item_id))
      return { myId, bills: groupBills, items: groupItems, itemShares: groupShares }
    })
  }

  // Same two-phase load as GroupGraphs.jsx/GroupStats.jsx: the recent
  // window (this year plus last) fetches first, across every active
  // group, so the page renders real numbers immediately; the rest of
  // every group's history backfills in the background afterward.
  const load = useCallback(async () => {
    try {
      const start = getStatsWindowStart()
      setWindowStart(start)

      const [memberResult, snapshotResult] = await Promise.all([
        supabase.from('group_members').select('id, group_id').eq('user_id', user.id).eq('active', true),
        supabase.from('departure_snapshots').select('group_id, daily_totals').eq('user_id', user.id),
      ])
      if (memberResult.error) throw memberResult.error
      if (snapshotResult.error) throw snapshotResult.error
      const memberRows = memberResult.data || []
      const groupIds = memberRows.map((r) => r.group_id)
      const participantByGroup = new Map(memberRows.map((r) => [r.group_id, r.id]))

      // A group you're back in shouldn't also count its old snapshot on
      // top of live data — live data already covers it fully.
      setSnapshots((snapshotResult.data || []).filter((s) => !groupIds.includes(s.group_id)))

      if (groupIds.length === 0) {
        setPerGroupData([])
        setRawCategories([])
        setHistoryStatus('complete')
        setLoading(false)
        return
      }

      const [categoriesResult, recentBillsData] = await Promise.all([
        supabase.from('categories').select('id, name, color, group_id').in('group_id', groupIds),
        fetchAllRows(() =>
          supabase.from('bills').select(BILLS_SELECT, { count: 'exact' }).in('group_id', groupIds).gte('created_at', start.toISOString())
        ),
      ])
      if (categoriesResult.error) throw categoriesResult.error
      const categoriesData = categoriesResult.data || []
      setRawCategories(categoriesData)
      setPerGroupData(deriveByGroup(recentBillsData, groupIds, participantByGroup))
      setError(null)
      // First paint happens now — see the matching comment in
      // GroupGraphs.jsx for why this can't be a `finally` after the
      // backfill below.
      setLoading(false)

      try {
        const olderBillsData = await fetchAllRows(() =>
          supabase.from('bills').select(BILLS_SELECT, { count: 'exact' }).in('group_id', groupIds).lt('created_at', start.toISOString())
        )
        setPerGroupData(deriveByGroup([...olderBillsData, ...recentBillsData], groupIds, participantByGroup))
        setHistoryStatus('complete')
      } catch {
        setHistoryStatus('failed')
      }
    } catch (err) {
      setError(loadErrorMessage(err))
      setLoading(false)
    }
  }, [user.id])

  useEffect(() => {
    load()
  }, [load])

  // Shared by the day/week/month path below and the per-bill path further
  // down — resolving an item's effective category name needs this either way.
  const categoryNameById = useMemo(() => new Map(rawCategories.map((c) => [c.id, c.name])), [rawCategories])

  // Independent of tab/offset, same reasoning as GroupGraphs.jsx's own
  // `daily` — computed once from everything fetched, windowed afterward by
  // buildSeries() itself. Every active group's own computeDailyTotalsForUser()
  // output, plus every departed group's frozen daily_totals (already the
  // same shape), all folded into one map together — a person's total
  // personal spend shouldn't quietly drop a group just because they left it.
  const daily = useMemo(() => {
    const perGroupDailies = perGroupData.map(({ myId, bills, items, itemShares }) =>
      computeDailyTotalsForUser(myId, { bills, items, itemShares, categoryNameById })
    )
    const snapshotDailies = snapshots.map((s) => s.daily_totals || {})
    return mergeDailyMaps([...perGroupDailies, ...snapshotDailies])
  }, [perGroupData, categoryNameById, snapshots])

  const mergedCategories = useMemo(() => mergeCategoriesByName(rawCategories), [rawCategories])

  const range = rangeForTab(tab, offset)
  const granularity = GRANULARITY_BY_TAB[tab]
  // Only about the live-bills backfill (see load()) — departed groups'
  // snapshot totals are always complete from the first render, nothing
  // about them is ever "still loading."
  const historyIncomplete =
    historyStatus !== 'complete' && Boolean(windowStart) && range.start && range.start < windowStart

  const points = buildSeries(daily, {
    start: range.start,
    end: range.end,
    granularity,
    categoryKey: categoryFilter || null,
  })
  const periodTotal = points.reduce((sum, p) => sum + p.amount, 0)

  // Per-category totals for the pie chart — summed straight from `daily`'s
  // own per-day category breakdown rather than re-deriving from raw
  // bills/items a second time, since `daily` already has exactly this
  // broken down by day; this just needs it collapsed to the selected range.
  const categoryTotalsInRange = {}
  for (const p of buildSeries(daily, { start: range.start, end: range.end, granularity: 'day' })) {
    const bucket = daily[p.key]
    for (const [name, amount] of Object.entries(bucket?.categories || {})) {
      categoryTotalsInRange[name] = (categoryTotalsInRange[name] || 0) + amount
    }
  }
  const pieSlices = Object.entries(categoryTotalsInRange).map(([categoryKey, amount]) => {
    const category = mergedCategories.find((c) => categoryKeyFor(c.name) === categoryKey)
    return {
      key: categoryKey,
      name: category?.name || categoryKey,
      color: category?.color || '#999999',
      amount: Math.round(amount * 100) / 100,
    }
  })

  const selectedCategory = mergedCategories.find((c) => categoryKeyFor(c.name) === categoryFilter)
  const lineColor = categoryFilter ? selectedCategory?.color || 'var(--accent)' : 'var(--accent)'

  return (
    <div className="page">
      <header className="page-header">
        <Link to="/stats" className="btn-link">
          ← Back
        </Link>
        <h1>Graphs</h1>
      </header>

      {error && <p className="status-error">{error}</p>}

      {loading ? (
        <p className="page-loading">Loading…</p>
      ) : (
        <>
          <GraphsPeriodSelector tab={tab} setTab={setTab} offset={offset} setOffset={setOffset} label={range.label} />
          {historyIncomplete && (
            <p className="muted graphs-history-note">
              {historyStatus === 'failed'
                ? "Couldn't load your full history, so numbers for this period may be incomplete — try refreshing."
                : 'Still loading your full history — numbers for this period may be incomplete until it finishes.'}
            </p>
          )}

          {mergedCategories.length > 0 && (
            <label className="graphs-category-filter">
              Category
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="">All spending</option>
                {mergedCategories.map((cat) => (
                  <option key={cat.name} value={categoryKeyFor(cat.name)}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <p className="graphs-period-total">
            <strong className="mono">{format(periodTotal)}</strong>{' '}
            <span className="muted">{selectedCategory?.name || 'total'} spent this period</span>
          </p>

          <LineChart points={points} format={format} color={lineColor} />

          <h2 className="settings-section-title">By category</h2>
          <PieChart slices={pieSlices} format={format} onSelectCategory={(key) => setCategoryFilter(key)} />
        </>
      )}
    </div>
  )
}
