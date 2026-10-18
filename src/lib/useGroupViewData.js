import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { fetchAllGroupMembers } from './members'
import { fetchCategories } from './categories'
import { loadErrorMessage } from './loadErrorMessage'
import { groupViewCache } from './groupViewCache'
import { groupStatsCache } from './groupStatsCache'
import { groupStatsSnapshotFromGroupView } from './groupStatsSnapshot'
import { isNotFoundError } from './notFound'
import { useCoalescedRunner } from './coalescedRunner'
import { createRealtimeRelevance } from './realtimeRelevance'
import { applyBillPatch, diffBillLists, emptyPending, planSync, queueAffected, VERIFY_BILL_PATCHES } from './billPatches'
import { useResync, resyncOnRejoin } from './realtimeResync'
import { fetchGroupBills, computeGroupViewSnapshot } from './groupViewSnapshot'
import { fetchGroupSettlement } from './groupBalances'
import { getStatsWindowStart } from './timeRange'
import { recordGroupVisit } from './recentGroups'
import { processDueRecurringBills } from './recurringBills'

const VERIFY_DELAY_MS = 30 * 1000

// Everything the group page (GroupView.jsx) shows that comes from the
// database, and keeping it current: the first paint (from groupViewCache,
// or a recent window of bills), the complete load, realtime changes
// patched in bill by bill (billPatches.js) with a verification pass
// behind them, resyncs after a dropped connection, and keeping the group
// and stats caches filled. The page itself only ever reads what this
// returns, and calls reloadAll()/refreshBills() after its own writes.
export function useGroupViewData(groupId) {
  const navigate = useNavigate()

  const [group, setGroup] = useState(null)
  const [allMembers, setAllMembers] = useState([])
  const [bills, setBills] = useState(null)
  // Mirrors `bills` for loadRecentBillsForFirstPaint's own race-check to
  // read from (see that function below), rather than closing over `bills`
  // directly — the mount effect that calls it runs once per group, not on
  // every `bills` change, so a plain closure would freeze it at whatever
  // `bills` was (its initial `null`) when that effect first ran. A ref
  // sidesteps that — always reads the latest value, with nothing to go
  // stale.
  const billsRef = useRef(null)
  // Which realtime events concern this group — replaced per group in the
  // subscription effect below (see realtimeRelevance.js).
  const relevanceRef = useRef(createRealtimeRelevance())
  // Work queued for the bills runner (see syncBills): a full reload, and/or
  // specific bills to patch, and/or a verification pass.
  const pendingRef = useRef(emptyPending())
  // True once this group's complete list has loaded — patches only ever
  // build on a complete list, never on the cache or the first-paint window.
  const fullyLoadedRef = useRef(false)
  // Bumped on every queued change; verifyPatches uses it to tell whether
  // anything happened while its comparison fetch was in flight.
  const changeCountRef = useRef(0)
  const verifyTimerRef = useRef(null)
  const billsRunnerRef = useRef(null)
  useEffect(() => {
    billsRef.current = bills
  }, [bills])
  // True once the definitive, complete (unwindowed) bill history has been
  // fetched at least once this visit — used by the "select all"/Danger
  // Zone check and the price-filter slider's own initialization (see each
  // one's own comment), both of which need the real full list, not
  // loadRecentBillsForFirstPaint's windowed preview. Starts true whenever
  // cache hydration already found something (a cached snapshot is only
  // ever written once complete — see the cache-write effect further
  // down), false otherwise. The group's balance no longer waits on this at
  // all — see loadSettlement below.
  const [historyComplete, setHistoryComplete] = useState(false)
  // null until the server-computed balance actually arrives (see
  // fetchGroupSettlement/get_group_balances) — never derived from
  // whatever's currently in `bills`, so there's no code path left that can
  // show a wrong number computed from a partial/windowed bill list. Stays
  // null (rather than flashing an empty "You're all settled up") for the
  // brief moment before that first resolves.
  const [settlement, setSettlement] = useState(null)
  const [weekTotal, setWeekTotal] = useState(0)
  const [monthTotal, setMonthTotal] = useState(0)
  const [error, setError] = useState(null)
  // { [billId]: { [memberId]: { paid, consumed } } } — computed from bills
  // already fetched (see computeAndSetBillDerivedState below), independent
  // of the group's own overall balance (which comes from the server now —
  // see loadSettlement). Lets each bill row show what *this* bill
  // specifically means for you, independent of the group's running
  // balance.
  const [billPersonalTotals, setBillPersonalTotals] = useState({})
  const [categories, setCategories] = useState([])

  // Every loader below used to just destructure `{ data }` and move on — a
  // failed request (a dropped connection, an expired session, anything)
  // silently looked identical to "this group genuinely has no bills," which
  // is a much harder bug to spot than an error message would have been.
  // Each one now checks `error` and surfaces it through the same banner the
  // rest of the page already uses, and clears it first so a later successful
  // reload doesn't leave a stale error sitting on screen.
  const loadGroup = useCallback(async () => {
    try {
      const { data, error: groupError } = await supabase.from('groups').select('*').eq('id', groupId).single()
      // A group that's already gone by the time this loads — deleted from
      // its own Danger Zone by an admin, in another tab or by someone else
      // in it, while this page was still open — used to just sit here
      // showing PostgREST's own raw "no rows" wording forever, on a page
      // with nothing left to load. Bounce back to the groups list instead,
      // same as BillView does for a deleted bill.
      if (isNotFoundError(groupError)) {
        navigate('/', { state: { notice: 'This group is no longer available.' } })
        return
      }
      if (groupError) throw groupError
      setGroup(data)
      setError(null)
    } catch (err) {
      setError(`Couldn't load this group: ${loadErrorMessage(err)}`)
    }
  }, [groupId, navigate])

  const loadMembers = useCallback(async () => {
    try {
      setAllMembers(await fetchAllGroupMembers(groupId))
      setError(null)
    } catch (err) {
      setError(`Couldn't load this group's members: ${loadErrorMessage(err)}`)
    }
  }, [groupId])

  const loadCategories = useCallback(async () => {
    try {
      setCategories(await fetchCategories(groupId))
      setError(null)
    } catch (err) {
      setError(`Couldn't load this group's categories: ${loadErrorMessage(err)}`)
    }
  }, [groupId])

  // Derives billPersonalTotals/week/monthTotal from bills already fetched
  // — deliberately separate from the fetch itself so both
  // loadBillsAndSettlement and loadRecentBillsForFirstPaint below can share
  // it. The actual derivation lives in groupViewSnapshot.js, shared with
  // the app-boot prefetch (see prefetchGroup.js) so both compute this the
  // same way. The group's own balance is set separately now, by
  // loadSettlement just below — see that function's own comment for why.
  function computeAndSetBillDerivedState(billsData) {
    const { billPersonalTotals, weekTotal, monthTotal } = computeGroupViewSnapshot(billsData)
    setBillPersonalTotals(billPersonalTotals)
    setWeekTotal(weekTotal)
    setMonthTotal(monthTotal)
  }

  // The group's balance — fetched entirely independently of whatever
  // `bills` currently holds. get_group_balances (see groupBalances.js)
  // always sums the group's *complete* history server-side, so unlike the
  // old client-side computation this was never unsafe to run against a
  // partial/windowed bill list — there's no bill list involved here at
  // all anymore, which is also what fixes the "balance briefly shows a
  // wildly wrong number, then corrects itself" bug this used to have: that
  // was the background warm-up prefetch (see prefetchGroup.js) computing a
  // balance from *all* payments ever made but only a recent window of
  // bills, and there's simply no such mismatch possible once neither this
  // function nor that prefetch ever computes a balance from bills at all.
  // Called for both a real bill-list reload and a payments-only realtime
  // update (see the subscription below) — either one can change the
  // balance, and re-fetching it is cheap enough not to bother
  // special-casing "just a payment."
  const loadSettlement = useCallback(async () => {
    try {
      setSettlement(await fetchGroupSettlement(supabase, groupId))
      setError(null)
    } catch (err) {
      setError(`Couldn't load balances: ${loadErrorMessage(err)}`)
    }
  }, [groupId])

  // Paints the bill list — and the week/month totals, safe from a partial
  // window since "this week"/"this month" is always inside it — fast, for
  // the one case that actually needs it: a group with no cached snapshot
  // at all yet (see the mount effect below, which only calls this when
  // groupViewCache came up empty). Deliberately never touches
  // `settlement` — loadSettlement above is the only thing that ever sets
  // it now, real load or not.
  const loadRecentBillsForFirstPaint = useCallback(async () => {
    try {
      const billsData = await fetchGroupBills(supabase, groupId, { since: getStatsWindowStart() })
      // loadBillsAndSettlement might already have won this race — a
      // small/young group with nothing to window in the first place, or
      // just a faster response. Applying this now would only ever be a
      // strictly worse, partial view of data the page already has in
      // full, so skip it entirely rather than flash backwards.
      if (billsRef.current) return
      setBills(billsData)
      setError(null)
      computeAndSetBillDerivedState(billsData)
    } catch {
      // Best-effort only — loadBillsAndSettlement is what actually has to
      // succeed; if this one fails there's simply nothing extra to show
      // meanwhile, same as before this existed.
    }
  }, [groupId])

  const loadBillsAndSettlement = useCallback(async () => {
    try {
      // Bills and the balance don't depend on each other, so fetch both at
      // once rather than waiting on one before starting the other.
      const [billsData, settlementData] = await Promise.all([
        fetchGroupBills(supabase, groupId),
        fetchGroupSettlement(supabase, groupId),
      ])

      // Set directly too (not only via the mirroring effect): a patch run
      // queued right behind this one must merge into this list.
      billsRef.current = billsData
      setBills(billsData)
      setSettlement(settlementData)
      setError(null)
      computeAndSetBillDerivedState(billsData)
      // The one place this ever gets confirmed true — this is the only
      // function that fetches the group's complete, unwindowed bill list.
      setHistoryComplete(true)
      // Complete list, so it's also what the realtime filter learns from,
      // and what per-bill patches may now safely build on.
      relevanceRef.current.learn(billsData)
      fullyLoadedRef.current = true
    } catch (err) {
      setError(`Couldn't load this group's bills: ${loadErrorMessage(err)}`)
    }
  }, [groupId])

  // Queues the verification pass ~30s after the latest patch (restarting the
  // wait on each new one, so a busy stretch gets one check at the end).
  const scheduleVerification = useCallback(() => {
    clearTimeout(verifyTimerRef.current)
    verifyTimerRef.current = setTimeout(() => {
      pendingRef.current.verify = true
      billsRunnerRef.current?.schedule()
    }, VERIFY_DELAY_MS)
  }, [])

  // Refreshes just `billIds` (see billPatches.js) plus the balance. Throws
  // on failure so syncBills can fall back to a full reload.
  const patchBills = useCallback(
    async (billIds) => {
      const [fetched, settlementData] = await Promise.all([
        fetchGroupBills(supabase, groupId, { billIds }),
        fetchGroupSettlement(supabase, groupId),
      ])
      relevanceRef.current.learn(fetched)
      const next = applyBillPatch(billsRef.current, billIds, fetched)
      billsRef.current = next
      setBills(next)
      setSettlement(settlementData)
      setError(null)
      computeAndSetBillDerivedState(next)
    },
    [groupId]
  )

  // The verification period: some time after a burst of patches, fetch the
  // whole list and compare. A difference means a patching bug — it's logged
  // with the bills involved, and the screen is corrected on the spot.
  // Skipped (not failed) if anything changed while fetching, since the
  // comparison would be meaningless; the next patch re-arms it anyway.
  const verifyPatches = useCallback(async () => {
    const before = billsRef.current
    const changesBefore = changeCountRef.current
    let fresh
    try {
      fresh = await fetchGroupBills(supabase, groupId)
    } catch {
      return // best-effort; the periodic resync still covers correctness
    }
    if (changeCountRef.current !== changesBefore || billsRef.current !== before) return
    const differing = diffBillLists(fresh, before)
    if (differing.length === 0) return
    console.warn('[bill patches] patched list differed from a full reload; corrected. Bills:', differing)
    relevanceRef.current.learn(fresh)
    billsRef.current = fresh
    setBills(fresh)
    computeAndSetBillDerivedState(fresh)
  }, [groupId])

  // The one task the bills runner executes: drains whatever's queued in
  // pendingRef. What to do is decided by planSync (billPatches.js, tested);
  // this only carries it out — and turns a failed patch into a full reload.
  const syncBills = useCallback(async () => {
    const plan = planSync(pendingRef.current, { fullyLoaded: fullyLoadedRef.current })
    pendingRef.current = emptyPending()

    if (plan.kind === 'full') {
      await loadBillsAndSettlement()
    } else if (plan.kind === 'patch') {
      try {
        await patchBills(plan.billIds)
        if (VERIFY_BILL_PATCHES) scheduleVerification()
      } catch (err) {
        console.error('Bill patch failed, reloading the whole list instead:', err)
        await loadBillsAndSettlement()
      }
    } else if (plan.kind === 'verify') {
      await verifyPatches()
    }
  }, [loadBillsAndSettlement, patchBills, verifyPatches, scheduleVerification])

  // Kept as its own name (rather than every call site just saying
  // loadBillsAndSettlement directly) since "reload everything" is the
  // concept call sites actually care about — bill create/delete, the
  // recurring-bills sweep, and the bills/items/item_shares realtime
  // subscription below all mean "the bill list itself changed," as
  // opposed to loadSettlement's narrower "just the balance."
  // All four go through coalesced runners (see coalescedRunner.js): realtime
  // handlers schedule(), the page's own writes call now().
  // The bills runner drains pendingRef through syncBills, so full reloads,
  // per-bill patches and verification passes all run strictly one at a
  // time: whatever is applied last was also fetched last.
  const billsRunner = useCoalescedRunner(syncBills)
  const settlementRunner = useCoalescedRunner(loadSettlement)
  const membersRunner = useCoalescedRunner(loadMembers)
  const categoriesRunner = useCoalescedRunner(loadCategories)
  useEffect(() => {
    billsRunnerRef.current = billsRunner
  }, [billsRunner])

  // The whole list, right away.
  const reloadAll = useCallback(() => {
    pendingRef.current.full = true
    billsRunner.now()
  }, [billsRunner])

  // Just these bills, right away — after the page's own edit to them.
  const refreshBills = useCallback(
    (billIds) => {
      for (const id of billIds) pendingRef.current.billIds.add(id)
      changeCountRef.current++
      billsRunner.now()
    },
    [billsRunner]
  )

  // Catches whatever realtime didn't deliver (app backgrounded, connection
  // dropped, or an event the relevance filter skipped) — see realtimeResync.js.
  // Always a full reload: a resync is exactly the "might have missed
  // something" case patches can't cover.
  const resyncAll = useCallback(() => {
    pendingRef.current.full = true
    billsRunner.schedule()
    membersRunner.schedule()
    categoriesRunner.schedule()
  }, [billsRunner, membersRunner, categoriesRunner])
  useResync(resyncAll)

  // Keeps the cache current with whatever's actually on screen — the
  // initial load, a background reload, and a realtime update all funnel
  // through the same state setters above, so this one effect covers all
  // three without any loader needing to know the cache exists. Guarded on
  // group/bills both being set so a still-loading (or failed-before-ever-
  // loading) page doesn't cache a half-populated snapshot that would paint
  // instantly-but-wrong the next time this group is opened — and now also
  // on historyComplete, so loadRecentBillsForFirstPaint's own windowed
  // preview (which does set `bills`, just not the full picture yet) is
  // never mistaken for the real thing and persisted as if it were.
  useEffect(() => {
    if (!group || !bills || !historyComplete) return
    // Stats (and Graphs) read the very same complete data, so they're
    // filled from here too — opening them from this page is instant, with
    // no loading of their own (see groupStatsSnapshot.js).
    if (allMembers.length) {
      groupStatsCache.set(groupId, groupStatsSnapshotFromGroupView({ group, allMembers, categories, bills }))
    }
    groupViewCache.set(groupId, {
      group,
      allMembers,
      categories,
      bills,
      billPersonalTotals,
      settlement,
      weekTotal,
      monthTotal,
    })
  }, [groupId, group, allMembers, categories, bills, billPersonalTotals, settlement, weekTotal, monthTotal, historyComplete])

  useEffect(() => {
    // Per-group patch state starts over: nothing learned, nothing queued,
    // and no patching until this group's complete list has loaded.
    const relevance = createRealtimeRelevance()
    relevanceRef.current = relevance
    pendingRef.current = emptyPending()
    fullyLoadedRef.current = false

    // Paints instantly from whatever was on screen last time this group was
    // open, if anything — then the loads just below always run anyway, so
    // a stale cache is never shown for more than the length of one fetch.
    // Not gated behind a "was there a cache hit" check on the loads
    // themselves; the point is a revisit is never *worse* than a fresh
    // visit, only sometimes faster to first paint.
    const cached = groupViewCache.get(groupId)
    if (cached) {
      setGroup(cached.group)
      setAllMembers(cached.allMembers)
      setCategories(cached.categories)
      setBills(cached.bills)
      setBillPersonalTotals(cached.billPersonalTotals)
      setSettlement(cached.settlement)
      setWeekTotal(cached.weekTotal)
      setMonthTotal(cached.monthTotal)
      // A cached snapshot is only ever written once complete (see the
      // cache-write effect above) — never partial.
      setHistoryComplete(true)
    } else {
      // Nothing cached at all — get *something* on screen fast (a recent
      // window) while the real, complete load right behind it is still in
      // flight, rather than showing nothing for however long a big or old
      // group's full history takes to fetch. A cached revisit already has
      // something to show immediately, so it skips straight to the one
      // real fetch below, same as before this existed.
      loadRecentBillsForFirstPaint()
    }

    loadGroup()
    membersRunner.now()
    categoriesRunner.now()
    reloadAll()

    // Feeds the app-boot warm-up (see recentGroups.js/prefetchGroup.js) —
    // recording every visit, personal group included, is simpler than
    // deciding here which groups are worth remembering; Groups.jsx is the
    // one place that already knows which ids are real groups worth
    // prefetching and filters there instead.
    recordGroupVisit(groupId)

    // Subscriptions' due bills are made by the database every hour; this
    // asks for this group's straight away too, so one due since the last
    // run shows up now (see recurringBills.js). A failure here shouldn't
    // break the rest of the page, so it's logged rather than surfaced.
    processDueRecurringBills(supabase, groupId)
      .then((result) => {
        if (result.created > 0) reloadAll()
      })
      .catch((err) => console.error('Failed to process recurring bills:', err))

    // `filter` narrows each subscription to *this* group specifically —
    // without it, being a member of several groups means every change
    // anywhere in any of them (RLS already limits it to groups you're
    // actually in, but not to the one you're currently looking at)
    // triggers a full reloadAll() here regardless of which group it was
    // actually for. Only possible where the table has its own group_id
    // column to filter on directly: bills/payments/group_members/
    // categories all do. items/item_shares don't (they only carry
    // bill_id/item_id, one join step further from group_id), and
    // Realtime's filter can't express a join — those two stay unfiltered,
    // same as before, which is the one real limitation here, not an
    // oversight — relevance.affectedBills() drops the ones that belong to
    // another group instead, and traces the rest to the one bill they touch
    // so only that bill is re-fetched. Every handler queues and schedules
    // rather than loading directly: realtime sends one event per row, so
    // one scan is dozens of events. A rejoin after a dropped connection
    // triggers a full resync.
    const onBillChange = (table) => (payload) => {
      if (!queueAffected(pendingRef.current, relevance.affectedBills(table, payload))) return
      changeCountRef.current++
      billsRunner.schedule()
    }
    const groupFilter = `group_id=eq.${groupId}`
    const channel = supabase
      .channel(`group-${groupId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills', filter: groupFilter }, onBillChange('bills'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, onBillChange('items'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_shares' }, onBillChange('item_shares'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: groupFilter }, () =>
        settlementRunner.schedule()
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: groupFilter }, () =>
        membersRunner.schedule()
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: groupFilter }, () =>
        categoriesRunner.schedule()
      )
      .subscribe(resyncOnRejoin(resyncAll))

    return () => {
      supabase.removeChannel(channel)
      clearTimeout(verifyTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  return {
    group,
    allMembers,
    categories,
    bills,
    billPersonalTotals,
    settlement,
    weekTotal,
    monthTotal,
    historyComplete,
    error,
    setError,
    reloadAll,
    refreshBills,
  }
}
