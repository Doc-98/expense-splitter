import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { fetchCategories } from '../lib/categories'
import { fetchGroupBills } from '../lib/groupViewSnapshot'
import { groupStatsCache } from '../lib/groupStatsCache'
import { statsRawFromBills, toWindowStart } from '../lib/groupStatsSnapshot'
import { loadErrorMessage } from '../lib/loadErrorMessage'
import { computeCategoryTotals, computeDailyTotalsForGroup } from '../lib/categoryStats'
import { getPeriodRange, getMultiMonthRange, filterByDateRange, getStatsWindowStart } from '../lib/timeRange'
import { buildSeries } from '../lib/timeSeries'
import { useCurrency } from '../context/CurrencyContext'
import GraphsPeriodSelector from '../components/GraphsPeriodSelector'
import LineChart from '../components/LineChart'
import PieChart from '../components/PieChart'
import BackButton from '../components/BackButton'
import { isNotFoundError } from '../lib/notFound'

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
  const navigate = useNavigate()
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

  function applyRawBills(rawBillsData) {
    const { rawBills, rawItems } = statsRawFromBills(rawBillsData)
    setBills(rawBills)
    setItems(rawItems)
  }

  // Bills come from get_group_bills, the group page's own fast call. With
  // complete history already cached (see the hydration effect below), the
  // background refresh re-fetches the complete list in one go; otherwise a
  // recent window first (so the page renders right away), then the rest.
  const load = useCallback(async () => {
    try {
      const start = getStatsWindowStart()
      const hadCompleteHistory = groupStatsCache.get(groupId)?.historyStatus === 'complete'
      if (!hadCompleteHistory) setWindowStart(start)
      const [{ data: groupRow, error: groupError }, categoriesData, billsData] = await Promise.all([
        supabase.from('groups').select('name').eq('id', groupId).single(),
        fetchCategories(groupId),
        fetchGroupBills(supabase, groupId, hadCompleteHistory ? {} : { since: start }),
      ])
      // Already gone (deleted elsewhere while this page was open) — bounce
      // back rather than render a chart for a group that no longer exists.
      if (isNotFoundError(groupError)) {
        navigate('/', { state: { notice: 'This group is no longer available.' } })
        return
      }
      if (groupError) throw groupError
      setGroupName(groupRow?.name || '')
      setCategories(categoriesData)
      applyRawBills(billsData)
      setError(null)
      // Charts render as soon as the first batch lands — the backfill
      // below (when there is one) doesn't block that.
      setLoading(false)
      if (hadCompleteHistory) {
        setHistoryStatus('complete')
        return
      }

      try {
        applyRawBills(await fetchGroupBills(supabase, groupId))
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
  }, [groupId, navigate])

  // Paints straight from the stats cache — the group page fills it as soon
  // as its own bill list has loaded (see groupStatsSnapshot.js), and Stats
  // keeps it current — then refreshes in the background.
  useEffect(() => {
    const cached = groupStatsCache.get(groupId)
    if (cached) {
      setGroupName(cached.groupName || '')
      setCategories(cached.categories)
      setBills(cached.rawBills)
      setItems(cached.rawItems)
      setHistoryStatus(cached.historyStatus)
      setWindowStart(toWindowStart(cached.historyWindowStart))
      setLoading(false)
    }
    load()
  }, [groupId, load])

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
        <BackButton to={`/groups/${groupId}/stats`} />
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
