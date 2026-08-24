import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { fetchAllGroupMembers } from '../lib/members'
import { fetchCategories } from '../lib/categories'
import { fetchAllRows } from '../lib/fetchAllRows'
import { loadErrorMessage } from '../lib/loadErrorMessage'
import { groupViewCache } from '../lib/groupViewCache'
import { computeBalances, computeSpendingTotals, simplifyDebts } from '../lib/settlement'
import { deriveBillsItemsShares } from '../lib/deriveBillData'
import { formatSettlementRecap, formatMultiBillRecap } from '../lib/recapText'
import { shareOrCopyText } from '../lib/shareText'
import { getPeriodRange, filterByDateRange } from '../lib/timeRange'
import { filterBills, billTotal } from '../lib/billFilters'
import { useClickOutside } from '../lib/useClickOutside'
import { useEscapeKey } from '../lib/useEscapeKey'
import { isTypingTarget } from '../lib/isTypingTarget'
import { useListKeyboardNav } from '../lib/useListKeyboardNav'
import { useCurrency } from '../context/CurrencyContext'
import { processDueRecurringBills } from '../lib/recurringBills'
import { groupItemsByDate } from '../lib/dateGroups'
import { buildGroupCsvRows, toCsv, downloadCsv } from '../lib/csv'
import SettlementSummary from '../components/SettlementSummary'
import ShareButton from '../components/ShareButton'
import InviteMenu from '../components/InviteMenu'
import Pagination from '../components/Pagination'
import BillActionsMenu from '../components/BillActionsMenu'
import RangeSlider from '../components/RangeSlider'
import { PrintableSettlementRecap } from '../components/PrintableRecap'

const BILLS_PAGE_SIZE = 15

export default function GroupView() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { format } = useCurrency()

  const [group, setGroup] = useState(null)
  const [allMembers, setAllMembers] = useState([])
  const [showMembers, setShowMembers] = useState(false)
  const memberPopoverRef = useRef(null)
  useClickOutside(memberPopoverRef, () => setShowMembers(false), showMembers)
  const [bills, setBills] = useState(null)
  // Mirrors `bills` for loadPaymentsAndSettlement below to read from,
  // rather than closing over `bills` directly — that function is handed
  // to the realtime subscription's payments handler (see the effect with
  // [groupId] deps further down), which is only ever set up once per
  // group, not re-subscribed every time `bills` changes; closing over
  // `bills` there would freeze it at whatever it was when the channel was
  // created (its initial `null`), silently computing settlement against
  // an empty bill list forever after a realtime payment update. A ref
  // sidesteps that — always reads the latest value, with nothing to go
  // stale.
  const billsRef = useRef(null)
  useEffect(() => {
    billsRef.current = bills
  }, [bills])
  const [billsPage, setBillsPage] = useState(0)
  const [newBillTitle, setNewBillTitle] = useState('')
  const [settlement, setSettlement] = useState(null)
  const [weekTotal, setWeekTotal] = useState(0)
  const [monthTotal, setMonthTotal] = useState(0)
  const [payments, setPayments] = useState([])
  const [error, setError] = useState(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [shareStatus, setShareStatus] = useState(null)
  // { [billId]: { [memberId]: { paid, consumed } } } — computed alongside
  // the group's overall settlement (see computeAndSetSettlement below), reusing
  // the exact same per-bill items/shares it already assembles for that,
  // just kept around per-bill instead of only flowing into one pooled
  // balance. Lets each bill row show what *this* bill specifically means
  // for you, independent of the group's running balance.
  const [billPersonalTotals, setBillPersonalTotals] = useState({})
  const [categories, setCategories] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  // Collapsed by default — a search bar plus a filters panel is a lot of
  // screen real estate for something you might not touch for a while if
  // you're just adding bills and settling up, not digging through old
  // ones. The "Search" button that opens it lives in .group-actions,
  // alongside Invite; the section itself carries its own ↑ to retract
  // (see the search section's JSX below), and "/" opens it too (see the
  // keydown effect below), matching whichever way it was closed.
  const [searchOpen, setSearchOpen] = useState(false)
  // Same Escape-to-close convention as the filters panel just below (and
  // every popover in the app, via useClickOutside) — an inline panel
  // toggled by its own button, same shape as filtersOpen, so it gets the
  // same treatment.
  useEscapeKey(() => setSearchOpen(false), searchOpen)
  // "/" jumps straight to this (see the keydown effect below), same
  // shortcut GitHub/Slack use for their own search boxes — so it needs a
  // real DOM node to call .focus() on, not just the value/onChange state
  // every other input on this page gets away with.
  const searchInputRef = useRef(null)
  // Focuses the search box the moment it actually mounts — searchOpen and
  // the ref becoming usable happen a render apart, so the keydown handler
  // below can't just call .focus() straight after setSearchOpen(true) and
  // expect the DOM node to already exist yet.
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])
  const [filtersOpen, setFiltersOpen] = useState(false)
  useEscapeKey(() => setFiltersOpen(false), filtersOpen)
  const [selectedTagIds, setSelectedTagIds] = useState(new Set())
  const [tagMatchMode, setTagMatchMode] = useState('any')
  // null until initialized from real data (see the effect below) — the
  // slider has nothing to show until there's at least one bill to derive
  // bounds from. Once set, a new pricier bill coming in later doesn't
  // silently widen a range someone already narrowed on purpose.
  const [priceRange, setPriceRange] = useState(null)

  const activeMembers = allMembers.filter((m) => m.active)
  const priceBounds =
    bills && bills.length > 0 ? { min: 0, max: Math.max(1, Math.ceil(Math.max(...bills.map(billTotal)))) } : null
  const priceFilterActive = Boolean(
    priceBounds && priceRange && (priceRange[0] > priceBounds.min || priceRange[1] < priceBounds.max)
  )
  const filtersActive = selectedTagIds.size > 0 || priceFilterActive
  // Search/tags/price all apply before pagination — Pagination and the
  // month/day grouping below only ever see whatever's left after
  // filtering, same as they only ever saw the full list before this
  // feature existed.
  const filteredBills = bills
    ? filterBills(bills, {
        query: searchQuery,
        tagIds: selectedTagIds,
        tagMode: tagMatchMode,
        minPrice: priceRange ? priceRange[0] : null,
        maxPrice: priceRange ? priceRange[1] : null,
      })
    : []
  // Grouped by month/day for the date dividers — only the current page's
  // worth of (filtered) bills, same slice the flat list used before
  // dividers existed.
  const visibleBills = filteredBills.slice(billsPage * BILLS_PAGE_SIZE, (billsPage + 1) * BILLS_PAGE_SIZE)
  const billGroups = groupItemsByDate(visibleBills)
  // My own participant row in this group — bills/items/payments reference
  // group_members.id now, not the raw account ID, so anything I create
  // needs this resolved first (e.g. defaulting a new bill's payer to me).
  const myParticipantId = allMembers.find((m) => m.userId === user.id)?.id
  const isAdmin = myParticipantId && myParticipantId === group?.admin_id
  // Whether the current selection happens to cover every bill in the
  // group, not just the visible page — bills holds the group's full list
  // (see loadBillsAndSettlement), so this is a real "delete everything" check, the same
  // one delete_all_group_bills() itself enforces server-side, not just a
  // guess based on what's currently on screen.
  const allBillsSelected = Boolean(bills && bills.length > 0 && selectedIds.size === bills.length)

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
      if (groupError) throw groupError
      setGroup(data)
      setError(null)
    } catch (err) {
      setError(`Couldn't load this group: ${loadErrorMessage(err)}`)
    }
  }, [groupId])

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

  // One unified per-bill shape — '*' for every plain bill column (title,
  // note, category_id, etc., what the bill list/search/filter need) plus
  // items(id, total_price, category_id, item_shares(...)) and bill_payers
  // (what the settlement math needs) — rather than the two separate
  // queries this used to be (one light, for the list; one heavier, for
  // balances). They were kept apart originally for code clarity — each
  // piece only asking for what it actually uses — but they're fetching
  // essentially the same bills either way, so on a group with a big
  // imported history, that meant two separate paginated round-trips where
  // one now does. Paged through fetchAllRows rather than one unbounded
  // request either way — a big group's bills, each with nested items, is
  // exactly the kind of response that's prone to silently timing out.
  const BILLS_SELECT = '*, items(id, total_price, category_id, item_shares(member_id, shares)), bill_payers(member_id, amount)'

  // Derives the settlement-side state (per-bill personal totals, the
  // group's simplified debts, the week/month preview totals) from bills
  // already fetched — deliberately separate from the fetch itself, so a
  // payments-only change (see loadPayments below) can recompute all of
  // this from whatever's already in `bills` state without re-fetching the
  // bill list just because a payment came or went.
  function computeAndSetSettlement(billsData, paymentsData) {
    const { list: settlementBills, items, itemShares } = deriveBillsItemsShares(billsData)

    // Same reuse principle as the weekly/monthly preview below — one
    // computeSpendingTotals() call per bill, scoped to just that bill's
    // own items/shares, rather than a second query. A bill nobody's
    // touched in either direction (no payer, nothing assigned) simply
    // has no entry for anyone, same "absence means zero involvement"
    // convention computeSpendingTotals already uses at the group level.
    const perBillTotals = {}
    for (const bill of settlementBills) {
      const billItems = items.filter((it) => it.bill_id === bill.id)
      const billItemIds = new Set(billItems.map((it) => it.id))
      const billItemShares = itemShares.filter((s) => billItemIds.has(s.item_id))
      perBillTotals[bill.id] = computeSpendingTotals({ bills: [bill], items: billItems, itemShares: billItemShares })
    }
    setBillPersonalTotals(perBillTotals)

    const thisWeek = getPeriodRange('week', 0)
    const thisMonth = getPeriodRange('month', 0)
    const weekBills = filterByDateRange(settlementBills, items, [], thisWeek.start, thisWeek.end)
    const monthBills = filterByDateRange(settlementBills, items, [], thisMonth.start, thisMonth.end)
    setWeekTotal(weekBills.items.reduce((sum, it) => sum + Number(it.total_price), 0))
    setMonthTotal(monthBills.items.reduce((sum, it) => sum + Number(it.total_price), 0))

    // computeBalances/simplifyDebts operate on a generic "userId" key —
    // it's always been just an opaque ID as far as they're concerned, so
    // feeding them group_members.id values (real accounts and guests
    // alike) needs no changes there, only here at the query/mapping
    // boundary.
    const paymentsForBalances = paymentsData.map((p) => ({
      from_user: p.from_member,
      to_user: p.to_member,
      amount: p.amount,
    }))
    const balances = computeBalances({ bills: settlementBills, items, itemShares, payments: paymentsForBalances })
    setSettlement(simplifyDebts(balances))
  }

  const loadBillsAndSettlement = useCallback(async () => {
    try {
      // Bills and payments don't depend on each other, so fetch both at
      // once rather than waiting on one before starting the other.
      const [billsData, paymentsData] = await Promise.all([
        fetchAllRows(() =>
          supabase
            .from('bills')
            .select(BILLS_SELECT, { count: 'exact' })
            .eq('group_id', groupId)
            .order('created_at', { ascending: false })
        ),
        fetchAllRows(() =>
          supabase
            .from('payments')
            .select('id, from_member, to_member, amount, created_at', { count: 'exact' })
            .eq('group_id', groupId)
            .order('created_at', { ascending: false })
        ),
      ])

      setBills(billsData)
      setPayments(paymentsData)
      setError(null)
      computeAndSetSettlement(billsData, paymentsData)
    } catch (err) {
      setError(`Couldn't load this group's bills: ${loadErrorMessage(err)}`)
    }
  }, [groupId])

  // A payments-only change (recording or deleting one) never touches the
  // bill list itself, so this only re-fetches payments and recomputes
  // settlement from the bills already sitting in state — no reason to
  // re-fetch every bill in the group just because a payment came or went.
  const loadPaymentsAndSettlement = useCallback(async () => {
    try {
      const paymentsData = await fetchAllRows(() =>
        supabase
          .from('payments')
          .select('id, from_member, to_member, amount, created_at', { count: 'exact' })
          .eq('group_id', groupId)
          .order('created_at', { ascending: false })
      )
      setPayments(paymentsData)
      setError(null)
      computeAndSetSettlement(billsRef.current || [], paymentsData)
    } catch (err) {
      setError(`Couldn't load payments: ${loadErrorMessage(err)}`)
    }
  }, [groupId])

  useEffect(() => {
    if (!bills) return
    const maxPage = Math.max(0, Math.ceil(filteredBills.length / BILLS_PAGE_SIZE) - 1)
    if (billsPage > maxPage) setBillsPage(maxPage)
  }, [bills, filteredBills.length, billsPage])

  // "/" jumps straight to the search box, from anywhere on the page —
  // independent of the list-navigation hook below (works in select mode,
  // or with zero bills currently matching a filter, since the box itself
  // is still there to change either of those). Opens the search section
  // first if it's currently collapsed — the useEffect above handles
  // actually focusing it once it's mounted; the direct .focus() call here
  // is for the already-open case, where there's no mount to wait on.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== '/' || isTypingTarget(document.activeElement)) return
      e.preventDefault()
      setSearchOpen(true)
      searchInputRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // ←/→ flip pages, ↑/↓ move the selected bill, Enter opens it — see
  // useListKeyboardNav.js. Disabled in select mode, where arrow keys/Enter
  // already mean something else (moving through checkboxes).
  const billNav = useListKeyboardNav({
    page: billsPage,
    setPage: setBillsPage,
    maxPage: Math.max(0, Math.ceil(filteredBills.length / BILLS_PAGE_SIZE) - 1),
    itemCount: visibleBills.length,
    disabled: selectMode,
    onOpen: (index) => {
      const bill = visibleBills[index]
      if (bill) navigate(`/groups/${groupId}/bills/${bill.id}`)
    },
  })

  // A fresh filter (or a changed price range) should start back on page 1
  // of its own results, not strand you on whatever page you happened to be
  // on for a completely different set of bills — the clamp above only
  // catches it when the new count happens to be too small for the current
  // page, not "the results changed" in general.
  useEffect(() => {
    setBillsPage(0)
  }, [searchQuery, selectedTagIds, tagMatchMode, priceRange])

  // Initializes the price slider from real data exactly once bills first
  // load — see the priceRange state comment above for why a later reload
  // (a new, pricier bill coming in) deliberately doesn't touch it again.
  useEffect(() => {
    if (priceRange !== null || !bills || bills.length === 0) return
    setPriceRange([0, Math.max(1, Math.ceil(Math.max(...bills.map(billTotal))))])
  }, [bills, priceRange])

  // Kept as its own name (rather than every call site just saying
  // loadBillsAndSettlement directly) since "reload everything" is the
  // concept call sites actually care about — bill create/delete, the
  // recurring-bills sweep, and the bills/items/item_shares realtime
  // subscription below all mean "the bill list itself changed," as
  // opposed to loadPaymentsAndSettlement's narrower "just a payment."
  const reloadAll = loadBillsAndSettlement

  // Keeps the cache current with whatever's actually on screen — the
  // initial load, a background reload, and a realtime update all funnel
  // through the same state setters above, so this one effect covers all
  // three without any loader needing to know the cache exists. Guarded on
  // group/bills both being set so a still-loading (or failed-before-ever-
  // loading) page doesn't cache a half-populated snapshot that would paint
  // instantly-but-wrong the next time this group is opened.
  useEffect(() => {
    if (!group || !bills) return
    groupViewCache.set(groupId, {
      group,
      allMembers,
      categories,
      bills,
      billPersonalTotals,
      settlement,
      payments,
      weekTotal,
      monthTotal,
    })
  }, [groupId, group, allMembers, categories, bills, billPersonalTotals, settlement, payments, weekTotal, monthTotal])

  useEffect(() => {
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
      setPayments(cached.payments)
      setWeekTotal(cached.weekTotal)
      setMonthTotal(cached.monthTotal)
    }

    loadGroup()
    loadMembers()
    loadCategories()
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, loadPaymentsAndSettlement)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, loadMembers)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, loadCategories)
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
    loadPaymentsAndSettlement()
  }

  async function deletePayment(paymentId) {
    if (!window.confirm('Delete this payment record?')) return
    setError(null)
    const { error: deleteError } = await supabase.from('payments').delete().eq('id', paymentId)
    if (deleteError) setError(deleteError.message)
    loadPaymentsAndSettlement()
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

  function toggleTag(tagId) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }

  function clearFilters() {
    setSearchQuery('')
    setSelectedTagIds(new Set())
    setTagMatchMode('any')
    if (priceBounds) setPriceRange([priceBounds.min, priceBounds.max])
  }

  async function deleteSelectedBills() {
    const count = selectedIds.size
    if (count === 0) return
    // Selecting every bill in the group and deleting them is the same
    // "wipe everything" action as the Danger Zone button, so it goes
    // through the same admin-gated RPC — this check is a courtesy (avoids
    // a doomed confirm dialog for a non-admin), the real enforcement is
    // the RPC's own admin check, same as the button.
    if (allBillsSelected && !isAdmin) {
      setError('Only the group admin can delete every bill in a group. Deselect at least one, or ask the admin.')
      return
    }
    if (!window.confirm(`Delete ${count} bill${count === 1 ? '' : 's'}? This removes all their items too.`)) return
    setError(null)
    const { error: deleteError } = allBillsSelected
      ? await supabase.rpc('delete_all_group_bills', { target_group_id: groupId, delete_payments: false })
      : await supabase.from('bills').delete().in('id', Array.from(selectedIds))
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setSelectedIds(new Set())
    setSelectMode(false)
    reloadAll()
  }

  // Entry point for the per-bill menu's own "Select" action — lands in the
  // exact same state as opening selection mode via the list's own "Select"
  // toggle and then ticking this one row by hand.
  function enterSelectModeWith(billId) {
    setSelectMode(true)
    setSelectedIds(new Set([billId]))
  }

  // Shared by both the per-bill menu's "Share" and the bulk select bar's
  // "Share" — fetched fresh on demand for the same reason exportGroupCsv()
  // below is: the bill list above only ever holds lightweight rows, and
  // sharing is rare enough that a dedicated round-trip per click is
  // simpler than keeping every bill's full item detail in page state at
  // all times just in case someone shares.
  async function shareBills(billIds) {
    setError(null)
    try {
      const { data, error: billsError } = await supabase
        .from('bills')
        .select(
          'id, title, note, created_at, paid_by, items(name, quantity, unit_price, total_price, item_shares(member_id, shares)), bill_payers(member_id, amount)'
        )
        .in('id', billIds)
        .order('created_at', { ascending: false })
      if (billsError) throw billsError

      const billsForRecap = (data || []).map((b) => ({ ...b, payers: b.bill_payers || [] }))
      const text = formatMultiBillRecap(billsForRecap, allMembers, format)
      const title =
        billsForRecap.length === 1 ? billsForRecap[0].title : `${billsForRecap.length} bills — ${group?.name}`
      const result = await shareOrCopyText(text, title)
      if (result === 'copied') {
        setShareStatus('Copied to clipboard!')
        setTimeout(() => setShareStatus(null), 2000)
      }
    } catch (err) {
      setError(err.message)
    }
  }

  // Fetched fresh on demand rather than kept in page state permanently —
  // the bill list above only ever needs lightweight rows (no items/shares),
  // and an export is infrequent enough that a dedicated round-trip when it's
  // actually clicked is simpler than keeping every bill's full item detail
  // loaded at all times just in case someone exports.
  async function exportGroupCsv() {
    setError(null)
    try {
      const [billsData, { data: categoriesData, error: categoriesError }] = await Promise.all([
        fetchAllRows(() =>
          supabase
            .from('bills')
            .select(
              'id, title, created_at, paid_by, category_id, items(name, quantity, unit_price, total_price, category_id, item_shares(member_id, shares)), bill_payers(member_id, amount)',
              { count: 'exact' }
            )
            .eq('group_id', groupId)
            .order('created_at', { ascending: true })
        ),
        supabase.from('categories').select('id, name').eq('group_id', groupId),
      ])
      if (categoriesError) throw categoriesError

      const bills = billsData.map((b) => ({ ...b, payers: b.bill_payers || [] }))
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

      {error && <p className="status-error">{error}</p>}

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
        {/* Hidden once the search section itself is open — its own ↑
            (below) is what closes it again, so there's never two controls
            on screen at once for the same thing. */}
        {bills && bills.length > 0 && !searchOpen && (
          <button
            type="button"
            className={`btn-secondary ${searchQuery || filtersActive ? 'bill-search-toggle-active' : ''}`}
            onClick={() => setSearchOpen(true)}
          >
            Search{searchQuery || filtersActive ? ' •' : ''}
          </button>
        )}
      </div>

      {bills && bills.length > 0 && searchOpen && (
        <>
          <div className="receipt-tape bill-search-tape">
            <input
              ref={searchInputRef}
              type="text"
              className="guide-search-input"
              placeholder="Search bills… (/)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search bills"
            />
            <button
              type="button"
              className={`btn-link bill-filter-toggle ${filtersActive ? 'bill-filter-toggle-active' : ''}`}
              onClick={() => setFiltersOpen((o) => !o)}
            >
              Filters{filtersActive ? ' •' : ''}
            </button>
            <button
              type="button"
              className="btn-icon bill-search-collapse"
              onClick={() => setSearchOpen(false)}
              aria-label="Hide search"
            >
              ↑
            </button>
          </div>

          {filtersOpen && (
            <div className="bill-filters-panel">
              {categories.length > 0 && (
                <div className="bill-filters-group">
                  <div className="bill-filters-group-header">
                    <span className="muted">Tags</span>
                    <div className="tab-row bill-filters-tag-mode">
                      <button
                        type="button"
                        className={`tab ${tagMatchMode === 'any' ? 'active' : ''}`}
                        onClick={() => setTagMatchMode('any')}
                      >
                        Match any
                      </button>
                      <button
                        type="button"
                        className={`tab ${tagMatchMode === 'all' ? 'active' : ''}`}
                        onClick={() => setTagMatchMode('all')}
                      >
                        Match all
                      </button>
                    </div>
                  </div>
                  <div className="chip-row">
                    {categories.map((cat) => (
                      <label key={cat.id} className={`buyer-chip ${selectedTagIds.has(cat.id) ? 'active' : ''}`}>
                        <input
                          type="checkbox"
                          checked={selectedTagIds.has(cat.id)}
                          onChange={() => toggleTag(cat.id)}
                        />
                        <span className="category-dot" style={{ background: cat.color }} />
                        {cat.name}
                      </label>
                    ))}
                    <label className={`buyer-chip ${selectedTagIds.has('uncategorized') ? 'active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={selectedTagIds.has('uncategorized')}
                        onChange={() => toggleTag('uncategorized')}
                      />
                      Uncategorized
                    </label>
                  </div>
                </div>
              )}
              {priceBounds && priceRange && priceBounds.max > priceBounds.min && (
                <div className="bill-filters-group">
                  <span className="muted">Amount</span>
                  <RangeSlider
                    min={priceBounds.min}
                    max={priceBounds.max}
                    valueMin={priceRange[0]}
                    valueMax={priceRange[1]}
                    onChangeMin={(v) => setPriceRange(([, hi]) => [v, hi])}
                    onChangeMax={(v) => setPriceRange(([lo]) => [lo, v])}
                    format={format}
                  />
                </div>
              )}
              {(searchQuery || filtersActive) && (
                <button type="button" className="btn-link" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
          )}
        </>
      )}

      <form onSubmit={createBill} className="inline-form">
        <input
          value={newBillTitle}
          onChange={(e) => setNewBillTitle(e.target.value)}
          placeholder="New bill (e.g. Lidl - Tuesday)"
        />
        <button type="submit" className="btn-primary">
          Add
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
          <div className="bulk-select-actions">
            <button
              type="button"
              className="btn-secondary"
              disabled={selectedIds.size === 0}
              onClick={() => shareBills(Array.from(selectedIds))}
            >
              Share
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={selectedIds.size === 0 || (allBillsSelected && !isAdmin)}
              onClick={deleteSelectedBills}
            >
              Delete selected
            </button>
          </div>
          {allBillsSelected && !isAdmin && (
            <p className="muted bulk-select-hint">Only the group admin can delete every bill at once.</p>
          )}
        </div>
      )}
      {shareStatus && <p className="muted share-status">{shareStatus}</p>}

      {bills?.length === 0 && (
        <p className="empty-state">No bills yet. Add one above, then scan or add a receipt.</p>
      )}
      {bills && bills.length > 0 && filteredBills.length === 0 && (
        <p className="empty-state">
          No bills match these filters.{' '}
          <button type="button" className="btn-link" onClick={clearFilters}>
            Clear filters
          </button>
        </p>
      )}

      <div className="bill-groups" onMouseMove={billNav.onListMouseMove}>
        {billGroups.map((monthGroup) => (
          <div key={monthGroup.key} className="bill-month-group">
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
                    // Undefined (not just zero) means "never touched this
                    // bill in either direction" — computeSpendingTotals
                    // only creates an entry for someone who paid and/or
                    // had at least one item assigned, same convention as
                    // the group's own overall balance.
                    const mine = billPersonalTotals[bill.id]?.[myParticipantId]
                    const net = mine ? Math.round((mine.paid - mine.consumed) * 100) / 100 : null
                    const billAmount = (
                      <span className="bill-amount-block">
                        <span className="mono bill-amount-total">{format(billTotal(bill))}</span>
                        {net === null ? (
                          <span className="bill-amount-status bill-amount-status-neutral">
                            You are not involved
                          </span>
                        ) : net < 0 ? (
                          <span className="bill-amount-status balance-negative">
                            You borrowed {format(-net)}
                          </span>
                        ) : (
                          <span className="bill-amount-status balance-positive">You lent {format(net)}</span>
                        )}
                      </span>
                    )
                    const flatIndex = visibleBills.findIndex((b) => b.id === bill.id)
                    const isFocused = billNav.active && !selectMode && flatIndex === billNav.focusedIndex
                    return (
                      <li
                        key={bill.id}
                        className={`bill-list-item${isFocused ? ' list-row-focused' : ''}`}
                        ref={isFocused ? billNav.rowRef : null}
                      >
                        {selectMode ? (
                          <label className="card-list-item bill-select-row">
                            {billLabel}
                            <span className="bill-row-right">
                              {billAmount}
                              <input
                                type="checkbox"
                                checked={selectedIds.has(bill.id)}
                                onChange={() => toggleSelected(bill.id)}
                              />
                            </span>
                          </label>
                        ) : (
                          <>
                            <Link to={`/groups/${groupId}/bills/${bill.id}`} className="card-list-item">
                              {billLabel}
                              <span className="bill-row-right">
                                {billAmount}
                                <span className="chevron">→</span>
                              </span>
                            </Link>
                            <BillActionsMenu
                              billTitle={bill.title}
                              onSelect={() => enterSelectModeWith(bill.id)}
                              onShare={() => shareBills([bill.id])}
                              onDelete={() => deleteBill(bill)}
                            />
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
      </div>
      <Pagination page={billsPage} setPage={setBillsPage} totalItems={filteredBills.length} pageSize={BILLS_PAGE_SIZE} />

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
