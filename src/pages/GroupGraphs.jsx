import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { fetchCategories } from '../lib/categories'
import { fetchAllRows } from '../lib/fetchAllRows'
import { loadErrorMessage } from '../lib/loadErrorMessage'
import { deriveBillsItemsShares } from '../lib/deriveBillData'
import { computeCategoryTotals, computeDailyTotalsForGroup } from '../lib/categoryStats'
import { getPeriodRange, getMultiMonthRange, filterByDateRange, getStatsWindowStart } from '../lib/timeRange'
import { buildSeries } from '../lib/timeSeries'
import { useCurrency } from '../context/CurrencyContext'
import GraphsPeriodSelector from '../components/GraphsPeriodSelector'
import LineChart from '../components/LineChart'
import PieChart from '../components/PieChart'

// tab -> the chart's own point granularity — a whole calendar month has
// too many days to plot meaningfully next to a whole year's worth of
// months, but a single month is exactly the one view where day-by-day
// actually says something. (Tried one point per bill/day/week instead —
// day and week especially made the line read as too spiky even with
// smoothing, so this reverts to the coarser, calmer version.)
const GRANULARITY_BY_TAB = { month: 'day', quad: 'month', year: 'month' }

function rangeForTab(tab, offset) {
  if (tab === 'month') return getPeriodRange('month', offset)
  if (tab === 'quad') return getMultiMonthRange(4, offset)
  return getPeriodRange('year', offset)
}

export default function GroupGraphs() {
  const { groupId } = useParams()
  const { format } = useCurrency()

  const [groupName, setGroupName] = useState('')
  const [categories, setCategories] = useState([])
  const [bills, setBills] = useState([])
  const [items, setItems] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [windowStart, setWindowStart] = useState(null)
  // 'loading' until the background backfill below finishes, 'complete'
  // once this group's full history is in `bills`, 'failed' if the
  // backfill itself errored — same three-state convention as GroupStats.jsx.
  // The recent window fetched up front stays shown regardless; this only
  // gates whether paging further back than it is safe to trust yet.
  const [historyStatus, setHistoryStatus] = useState('loading')

  // Defaults to the year view — the whole point of this page is a
  // birds-eye "how does my spending look" glance, and a year is the widest
  // thing on offer here short of scrolling back indefinitely.
  const [tab, setTab] = useState('year')
  const [offset, setOffset] = useState(0)
  // Category id, or '' for every category combined — '' rather than null
  // so it plugs directly into a <select>'s value without a translation step.
  const [categoryFilter, setCategoryFilter] = useState('')

  const BILLS_SELECT = 'id, created_at, category_id, items(id, total_price, category_id)'

  function applyRawBills(rawBillsData) {
    const { list, items: derivedItems } = deriveBillsItemsShares(rawBillsData)
    setBills(list)
    setItems(derivedItems)
  }

  // Same two-phase load as GroupStats.jsx: the recent window (this year
  // plus last) fetches first so the page renders real, correct numbers
  // immediately for This month/Last 4 months/most of This year, then the
  // rest of this group's history backfills in the background. Only once
  // that finishes can paging further back than the window be trusted.
  const load = useCallback(async () => {
    try {
      const start = getStatsWindowStart()
      setWindowStart(start)
      const [{ data: groupRow }, categoriesData, recentBillsData] = await Promise.all([
        supabase.from('groups').select('name').eq('id', groupId).single(),
        fetchCategories(groupId),
        fetchAllRows(() =>
          supabase.from('bills').select(BILLS_SELECT, { count: 'exact' }).eq('group_id', groupId).gte('created_at', start.toISOString())
        ),
      ])
      setGroupName(groupRow?.name || '')
      setCategories(categoriesData)
      applyRawBills(recentBillsData)
      setError(null)
      // First paint happens now, with real (if possibly incomplete)
      // numbers — the backfill below runs after, in the background, not
      // blocking this. A `finally` here would defeat the entire point of
      // the two-phase fetch by keeping the loading spinner up until the
      // backfill (which can mean paging through years of bills) finishes.
      setLoading(false)

      try {
        const olderBillsData = await fetchAllRows(() =>
          supabase.from('bills').select(BILLS_SELECT, { count: 'exact' }).eq('group_id', groupId).lt('created_at', start.toISOString())
        )
        applyRawBills([...olderBillsData, ...recentBillsData])
        setHistoryStatus('complete')
      } catch {
        // The recent window above is still shown, correctly, for anything
        // within it — this only means older history couldn't be reached.
        setHistoryStatus('failed')
      }
    } catch (err) {
      setError(loadErrorMessage(err))
      setLoading(false)
    }
  }, [groupId])

  useEffect(() => {
    load()
  }, [load])

  // Independent of tab/offset — every day this group has ever spent
  // anything in (within the fetched window), bucketed once. buildSeries()
  // below does its own windowing into whatever span the selector currently
  // has active, so this doesn't need recomputing on every ‹ › click.
  const daily = useMemo(() => computeDailyTotalsForGroup({ bills, items }), [bills, items])

  const range = rangeForTab(tab, offset)
  const granularity = GRANULARITY_BY_TAB[tab]
  // Only matters once the background backfill has actually finished (or
  // failed) — while it's still in flight, paging back past the initial
  // window is exactly the case that note exists for; once historyStatus
  // is 'complete', everything's loaded regardless of how far back you go.
  const historyIncomplete =
    historyStatus !== 'complete' && Boolean(windowStart) && range.start && range.start < windowStart

  const points = buildSeries(daily, {
    start: range.start,
    end: range.end,
    granularity,
    categoryKey: categoryFilter || null,
  })
  const periodTotal = points.reduce((sum, p) => sum + p.amount, 0)

  const { bills: periodBills, items: periodItems } = filterByDateRange(bills, items, [], range.start, range.end)
  const categoryTotals = computeCategoryTotals({ bills: periodBills, items: periodItems })
  const pieSlices = Object.entries(categoryTotals).map(([id, amount]) => ({
    key: id,
    name: id === 'uncategorized' ? 'Uncategorized' : categories.find((c) => c.id === id)?.name || 'Uncategorized',
    color: id === 'uncategorized' ? '#999999' : categories.find((c) => c.id === id)?.color || '#999999',
    amount,
  }))

  const selectedCategory = categories.find((c) => c.id === categoryFilter)
  const selectedCategoryLabel = categoryFilter === 'uncategorized' ? 'Uncategorized' : selectedCategory?.name
  const lineColor = categoryFilter === 'uncategorized' ? '#999999' : selectedCategory?.color || 'var(--accent)'

  return (
    <div className="page">
      <header className="page-header">
        <Link to={`/groups/${groupId}/stats`} className="btn-link">
          ← Back
        </Link>
        <h1>Graphs{groupName ? ` — ${groupName}` : ''}</h1>
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
                ? "Couldn't load this group's full history, so numbers for this period may be incomplete — try refreshing."
                : "Still loading this group's full history — numbers for this period may be incomplete until it finishes."}
            </p>
          )}

          {categories.length > 0 && (
            <label className="graphs-category-filter">
              Category
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="">All spending</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
                <option value="uncategorized">Uncategorized</option>
              </select>
            </label>
          )}

          <p className="graphs-period-total">
            <strong className="mono">{format(periodTotal)}</strong>{' '}
            <span className="muted">{selectedCategoryLabel || 'total'} spent this period</span>
          </p>

          <LineChart points={points} format={format} color={lineColor} />

          <h2 className="settings-section-title">By category</h2>
          <PieChart slices={pieSlices} format={format} onSelectCategory={(key) => setCategoryFilter(key)} />
        </>
      )}
    </div>
  )
}
