import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../context/CurrencyContext'
import { computeBalances, computeSpendingTotals } from '../lib/settlement'
import { computeMyCategorySpend, mergeCategorySpend } from '../lib/categoryStats'
import { mergeCategoriesByName } from '../lib/categories'
import { fetchThresholds } from '../lib/thresholds'
import { fetchAllRows } from '../lib/fetchAllRows'
import { loadErrorMessage } from '../lib/loadErrorMessage'
import { accountStatsCache } from '../lib/accountStatsCache'
import { getStatsPreferences, setStatsPreferences } from '../lib/statsPreferences'
import {
  getPeriodRange,
  filterByDateRange,
  sumDailyInRange,
  sumCategoryDailyInRange,
  monthlyFromDaily,
  getStatsWindowStart,
} from '../lib/timeRange'
import { deriveBillsItemsShares } from '../lib/deriveBillData'
import { comparePeriods } from '../lib/periodComparison'
import { formatAccountStatsRecap } from '../lib/recapText'
import TimeRangeSelector from '../components/TimeRangeSelector'
import ComparisonBadge from '../components/ComparisonBadge'
import ShareButton from '../components/ShareButton'
import { PrintableAccountStatsRecap } from '../components/PrintableRecap'

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
  // Read once on mount — the lazy useState initializer form, so this never
  // re-reads localStorage on a later render. Always applied with offset 0;
  // "default" is a granularity (week/month/year/all), never a specific
  // frozen point in time.
  const [granularity, setGranularity] = useState(() => getStatsPreferences().defaultGranularity)
  const [offset, setOffset] = useState(0)
  // Separate from `granularity` above (which changes as you browse around)
  // so the TimeRangeSelector outline can move the instant "Set as default"
  // is clicked, without needing a reload to reflect the new saved value.
  const [defaultGranularity, setDefaultGranularity] = useState(() => getStatsPreferences().defaultGranularity)
  const [thresholdsPosition, setThresholdsPosition] = useState(() => getStatsPreferences().thresholdsPosition)
  const [error, setError] = useState(null)
  // 'loading' until the background backfill (see load() below) finishes,
  // 'complete' once every one of my groups' full history is in rawBills,
  // 'failed' if the backfill errored. Unlike GroupStats.jsx, this page
  // doesn't only show the notice when the *selected period* needs older
  // data — overallBalance below is a "right now, regardless of period"
  // figure that always needs full history to be correct, so the notice
  // here is gated on historyStatus alone, not on isViewCovered.
  const [historyStatus, setHistoryStatus] = useState('loading')
  const [historyWindowStart, setHistoryWindowStart] = useState(null)

  function handleSetDefaultGranularity(g) {
    setStatsPreferences({ defaultGranularity: g })
    setDefaultGranularity(g)
  }

  function toggleThresholdsPosition() {
    const next = thresholdsPosition === 'top' ? 'bottom' : 'top'
    setStatsPreferences({ thresholdsPosition: next })
    setThresholdsPosition(next)
  }

  const BILLS_SELECT =
    'id, group_id, title, created_at, paid_by, category_id, items(id, total_price, category_id, item_shares(member_id, shares)), bill_payers(member_id, amount)'

  // Returns the derived { list, items, itemShares } alongside setting
  // rawBills/rawItems/rawShares from it — the caller (load(), below) needs
  // that derived shape immediately, to compute overallBalance from,
  // without waiting on a re-render to read the new state back out.
  function applyRawBills(rawBillsData) {
    const { list, items, itemShares } = deriveBillsItemsShares(rawBillsData)
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
    return { list, items, itemShares }
  }

  // The live balance from every group still active in, on top of any
  // not-yet-settled balance frozen from a group left — a "right now"
  // figure, not scoped to whatever period is selected below, so it's the
  // one number on this page that always needs *every* bill and payment to
  // be correct. That's why it's only ever computed from the fully
  // backfilled data in load() below, never from just the recent window.
  function computeOverallBalance(list, items, itemShares, groupIds, participantByGroup, paymentsData, snapshotData) {
    let balanceSum = 0
    for (const groupId of groupIds) {
      const myId = participantByGroup.get(groupId)
      const groupBills = list.filter((b) => b.group_id === groupId)
      const groupItems = items.filter((it) => groupBills.some((b) => b.id === it.bill_id))
      const groupShares = itemShares.filter((s) => groupItems.some((it) => it.id === s.item_id))
      const groupPayments = paymentsData
        .filter((p) => p.group_id === groupId)
        .map((p) => ({ from_user: p.from_member, to_user: p.to_member, amount: p.amount }))
      const balances = computeBalances({ bills: groupBills, items: groupItems, itemShares: groupShares, payments: groupPayments })
      balanceSum += balances[myId] || 0
    }
    for (const snap of snapshotData.filter((s) => !groupIds.includes(s.group_id))) {
      if (!snap.balance_settled) balanceSum += Number(snap.balance)
    }
    return Math.round(balanceSum * 100) / 100
  }

  // The bills fetch is split into two phases, same as GroupStats.jsx: a
  // "recent window" (this year plus last year — see getStatsWindowStart)
  // fetched up front so the page renders immediately with genuinely
  // correct numbers for any of today's default views, then the rest of
  // every group's history backfilled afterward in the background. Only
  // once that backfill finishes does this recompute overallBalance — see
  // the comment on computeOverallBalance above for why that figure
  // specifically can't be computed from a partial window.
  const load = useCallback(async () => {
    setError(null)
    try {
      const windowStart = getStatsWindowStart()
      setHistoryWindowStart(windowStart)

      // None of these three depend on each other — group_members only needs
      // user.id, and thresholds/departure snapshots are scoped to the
      // account, not to any particular group — so all three fire at once
      // instead of stacking three round-trips before anything else can even
      // start (everything below this needs groupIds, which only comes from
      // the first of these).
      const [memberResult, thresholdsData, snapshotResult] = await Promise.all([
        supabase.from('group_members').select('id, group_id').eq('user_id', user.id).eq('active', true),
        fetchThresholds(user.id),
        supabase.from('departure_snapshots').select('*').eq('user_id', user.id),
      ])
      if (memberResult.error) throw memberResult.error
      if (snapshotResult.error) throw snapshotResult.error
      const memberRows = memberResult.data

      const groupIds = (memberRows || []).map((r) => r.group_id)
      const participantByGroup = new Map((memberRows || []).map((r) => [r.group_id, r.id]))
      setMyParticipantByGroup(participantByGroup)
      setThresholds(thresholdsData)

      // Departed groups' frozen records — a group you're back in shouldn't
      // also show a stale snapshot, live data already covers it fully.
      const snapshotData = snapshotResult.data || []
      setSnapshots(snapshotData.filter((s) => !groupIds.includes(s.group_id)))

      // Everything below only needs groupIds (known now) and none of it
      // depends on any of the others' results either, so all four fetch at
      // once rather than one after another. Payments aren't windowed like
      // bills are — the table is small (people settle up far less often
      // than they add bills) and overallBalance needs every payment
      // regardless, so there's nothing to gain by deferring it.
      const [groupsResult, recentBillsData, categoriesResult, paymentsResult] = await Promise.all([
        groupIds.length
          ? supabase.from('groups').select('id, name').in('id', groupIds)
          : Promise.resolve({ data: [], error: null }),
        groupIds.length
          ? fetchAllRows(() =>
              supabase.from('bills').select(BILLS_SELECT, { count: 'exact' }).in('group_id', groupIds).gte('created_at', windowStart.toISOString())
            )
          : Promise.resolve([]),
        // For the "Spending thresholds" section below — every category
        // across every group I'm in (so same-named tags from different
        // groups can be merged, see mergeCategoriesByName).
        groupIds.length
          ? supabase
              .from('categories')
              .select('id, name, color')
              .in('group_id', groupIds)
              .order('created_at', { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        groupIds.length
          ? supabase.from('payments').select('id, group_id, from_member, to_member, amount').in('group_id', groupIds)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (groupsResult.error) throw groupsResult.error
      if (categoriesResult.error) throw categoriesResult.error
      if (paymentsResult.error) throw paymentsResult.error

      setGroups(groupsResult.data || [])
      // Deliberately doesn't touch historyStatus/overallBalance here — see
      // the comment above applyRawBills's call site in the backfill below.
      applyRawBills(recentBillsData)
      setRawCategories(categoriesResult.data || [])

      const paymentsData = paymentsResult.data || []

      try {
        const olderBillsData = groupIds.length
          ? await fetchAllRows(() =>
              supabase.from('bills').select(BILLS_SELECT, { count: 'exact' }).in('group_id', groupIds).lt('created_at', windowStart.toISOString())
            )
          : []
        const { list, items, itemShares } = applyRawBills([...olderBillsData, ...recentBillsData])
        setOverallBalance(computeOverallBalance(list, items, itemShares, groupIds, participantByGroup, paymentsData, snapshotData))
        setHistoryStatus('complete')
      } catch {
        // The recent window above is still shown, correctly, for anything
        // within it — this only means older history (and therefore
        // overallBalance, which needs all of it) couldn't be reached, so
        // the "still loading" notice below stays up rather than
        // disappearing, but nothing already on screen is wrong.
        setHistoryStatus('failed')
      }
    } catch (err) {
      // Without this, a failure anywhere above (most likely: fetchThresholds
      // hitting a spending_thresholds table that doesn't exist yet on a
      // database that hasn't run migration_thresholds.sql) silently
      // aborted the rest of load() with nothing shown — whatever state had
      // already been set before the failure just stayed on screen,
      // incomplete, with no indication anything had gone wrong.
      setError(loadErrorMessage(err))
    }
  }, [user.id])

  // Same cache-then-revalidate pattern as GroupView.jsx/GroupStats.jsx:
  // paint instantly from whatever Your Stats looked like last time this
  // page was open (if anything), then always fetch fresh anyway — a
  // revisit is never worse than today's plain reload, just sometimes
  // faster to first paint. Depends only on [user.id, load] (not on the
  // state it hydrates), so this fires once per account, not every time
  // load() finishes populating that same state — the write-back effect
  // just below stays in sync with it on every change instead.
  useEffect(() => {
    const cached = accountStatsCache.get(user.id)
    if (cached) {
      setGroups(cached.groups)
      setMyParticipantByGroup(cached.myParticipantByGroup)
      setRawBills(cached.rawBills)
      setRawItems(cached.rawItems)
      setRawShares(cached.rawShares)
      setRawCategories(cached.rawCategories)
      setThresholds(cached.thresholds)
      setSnapshots(cached.snapshots)
      setOverallBalance(cached.overallBalance)
      setHistoryStatus(cached.historyStatus)
      setHistoryWindowStart(cached.historyWindowStart)
    }
    load()
  }, [user.id, load])

  useEffect(() => {
    if (!groups.length && !snapshots.length) return
    accountStatsCache.set(user.id, {
      groups,
      myParticipantByGroup,
      rawBills,
      rawItems,
      rawShares,
      rawCategories,
      thresholds,
      snapshots,
      overallBalance,
      historyStatus,
      historyWindowStart,
    })
  }, [
    user.id,
    groups,
    myParticipantByGroup,
    rawBills,
    rawItems,
    rawShares,
    rawCategories,
    thresholds,
    snapshots,
    overallBalance,
    historyStatus,
    historyWindowStart,
  ])

  // Unlike GroupStats.jsx, not gated on isViewCovered for the selected
  // period — overallBalance above is always on screen and always needs
  // full history, so as long as that backfill hasn't finished, the notice
  // stays up regardless of which period happens to be selected.
  const historyIncomplete = historyStatus !== 'complete' && Boolean(historyWindowStart)

  const { start, end, label, yearLabel } = getPeriodRange(granularity, offset)
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

  // A departed group's category spend for a given range, combined across
  // every snapshot — a snapshot recorded before category tracking existed
  // simply has no `categories` key on any of its days and contributes
  // nothing here (see sumCategoryDailyInRange), so this stays correct for a
  // mix of old and new snapshots without any special-casing.
  function snapshotCategorySpendForRange(rangeStart, rangeEnd) {
    return snapshots.reduce(
      (acc, s) => mergeCategorySpend(acc, sumCategoryDailyInRange(s.daily_totals, rangeStart, rangeEnd)),
      {}
    )
  }

  const myCategorySpend = mergeCategorySpend(
    computeMyCategorySpend({
      bills: monthFiltered.bills,
      items: monthFiltered.items,
      itemShares: monthFiltered.itemShares,
      myParticipantIds,
      categoryNameById,
    }),
    snapshotCategorySpendForRange(thisMonth.start, thisMonth.end)
  )
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

  // Same paid/consumed aggregation as byGroup/myTotals above (live groups'
  // computeSpendingTotals plus departed groups' sumDailyInRange), just for
  // an arbitrary range with no per-group rows kept around — only used below
  // to get the *previous* period's totals to compare the current ones
  // against, so there's nothing here that needs its own table.
  function computeMyPaidConsumedForRange(rangeStart, rangeEnd) {
    const filtered = filterByDateRange(rawBills, rawItems, rawShares, rangeStart, rangeEnd)
    let paid = 0
    let consumed = 0
    for (const g of groups) {
      const myId = myParticipantByGroup.get(g.id)
      const groupBills = filtered.bills.filter((b) => b.group_id === g.id)
      const groupBillIds = new Set(groupBills.map((b) => b.id))
      const groupItems = filtered.items.filter((it) => groupBillIds.has(it.bill_id))
      const groupItemIds = new Set(groupItems.map((it) => it.id))
      const groupShares = filtered.itemShares.filter((s) => groupItemIds.has(s.item_id))
      const totals = computeSpendingTotals({ bills: groupBills, items: groupItems, itemShares: groupShares })[myId]
      paid += totals?.paid || 0
      consumed += totals?.consumed || 0
    }
    for (const s of snapshots) {
      const t = sumDailyInRange(s.daily_totals, rangeStart, rangeEnd)
      paid += t.paid
      consumed += t.consumed
    }
    return { paid: Math.round(paid * 100) / 100, consumed: Math.round(consumed * 100) / 100 }
  }

  // Category spend for whatever period is currently selected (independent
  // of the fixed-to-this-month threshold spend computed above) — always
  // shown, same as GroupStats' own "By category" section, whether or not
  // there's a previous period to compare against. Includes departed
  // groups' snapshots, same as the threshold spend above.
  const currentCategorySpend = mergeCategorySpend(
    computeMyCategorySpend({ bills, items, itemShares, myParticipantIds, categoryNameById }),
    snapshotCategorySpendForRange(start, end)
  )

  // "Previous period" only means something for week/month/year — there's no
  // period before "all time" to compare against, same reasoning as
  // GroupStats.
  const canCompare = granularity !== 'all'
  let paidComparison = null
  let consumedComparison = null
  let previousCategorySpend = {}
  if (canCompare) {
    const previousRange = getPeriodRange(granularity, offset - 1)
    const previousTotals = computeMyPaidConsumedForRange(previousRange.start, previousRange.end)
    paidComparison = comparePeriods(myTotals.paid, previousTotals.paid)
    consumedComparison = comparePeriods(myTotals.consumed, previousTotals.consumed)

    const previousFiltered = filterByDateRange(rawBills, rawItems, rawShares, previousRange.start, previousRange.end)
    previousCategorySpend = mergeCategorySpend(
      computeMyCategorySpend({
        bills: previousFiltered.bills,
        items: previousFiltered.items,
        itemShares: previousFiltered.itemShares,
        myParticipantIds,
        categoryNameById,
      }),
      snapshotCategorySpendForRange(previousRange.start, previousRange.end)
    )
  }

  const categoryRows = Object.entries(currentCategorySpend)
    .map(([key, { name, amount }]) => ({
      key,
      name,
      color: categoryColorByKey.get(key) || '#999999',
      amount,
      comparison: canCompare ? comparePeriods(amount, previousCategorySpend[key]?.amount || 0) : null,
    }))
    .sort((a, b) => b.amount - a.amount)
  const maxCategoryAmount = Math.max(1, ...categoryRows.map((c) => c.amount))

  // Feeds both the "Share as text" and "Download as PDF" recap options
  // (see ShareButton/PrintableAccountStatsRecap below) — one object, built
  // once from whatever's already on screen, same reasoning as GroupStats.jsx's
  // own `recap`.
  const recap = {
    periodLabel: yearLabel ? `${yearLabel} — ${label}` : label,
    paid: myTotals.paid,
    consumed: myTotals.consumed,
    overallBalance,
    categoryRows,
    byGroupRows: byGroup.map((g) => ({
      id: g.id,
      name: g.left ? `${g.name} (left)` : g.name,
      fronted: g.paid,
      share: g.consumed,
    })),
    monthlyRows: showMonthly ? monthlyRows.map(([key, amount]) => ({ key, label: monthLabel(key), amount })) : [],
  }

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

  // Built once and placed at whichever end of the page thresholdsPosition
  // says — top (above the period selector) or bottom (after everything
  // else) — never in the middle, since every other section on this page
  // moves with the period selector and this one deliberately doesn't.
  const thresholdsSection = thresholdRows.length > 0 && (
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
        selected above. <Link to="/thresholds">Manage thresholds →</Link>{' · '}
        <button type="button" className="btn-link" onClick={toggleThresholdsPosition}>
          {thresholdsPosition === 'top' ? 'Show at bottom instead' : 'Show at top instead'}
        </button>
      </p>
    </>
  )

  return (
    <div className="page">
      <header className="page-header">
        <Link to="/" className="btn-link">
          ← Groups
        </Link>
        <h1>Your stats</h1>
      </header>

      {/* Rendered above the groups.length check below, not inside it — a
          failed load() leaves groups at its empty initial state, and that
          check alone would otherwise show "Join or create a group" instead
          of the actual error, which is exactly the kind of silently
          misleading result this is meant to prevent. */}
      {error && <p className="status-error">Couldn't load your stats: {error}</p>}
      {historyIncomplete && (
        <p className="muted">
          {historyStatus === 'failed'
            ? "Couldn't load your full history, so the numbers below may be incomplete — try refreshing."
            : 'Still loading your full history — the numbers below may be incomplete until it finishes.'}
        </p>
      )}

      {groups.length === 0 && snapshots.length === 0 ? (
        <p className="empty-state">Join or create a group to start seeing your stats.</p>
      ) : (
        <>
          {thresholdsPosition === 'top' && thresholdsSection}

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
              <span className="stats-summary-value mono">{format(myTotals.paid)}</span>
              <span className="muted">you fronted</span>
              {paidComparison && <ComparisonBadge comparison={paidComparison} />}
            </div>
            <div className="stats-summary-item">
              <span className="stats-summary-value mono">{format(myTotals.consumed)}</span>
              <span className="muted">your share</span>
              {consumedComparison && <ComparisonBadge comparison={consumedComparison} />}
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

          {categoryRows.length > 0 && (
            <>
              <h2 className="settings-section-title">By category</h2>
              <div className="stats-bars">
                {categoryRows.map((c) => (
                  <div key={c.key} className="stats-bar-group">
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
              <p className="muted stats-note">
                For the period selected above, and your own share only — same as the summary
                numbers, including departed groups. The one exception is a group left before this
                breakdown existed: its snapshot has no category data for that period to draw from,
                so it's missing here even though its total still counts in the summary above.
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

          {thresholdsPosition === 'bottom' && thresholdsSection}

          <div className="recap-actions">
            <ShareButton label="Share recap" title="Your stats" getText={() => formatAccountStatsRecap(recap, format)} />
          </div>
          <PrintableAccountStatsRecap recap={recap} />
        </>
      )}
    </div>
  )
}
