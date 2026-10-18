import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { fetchAllGroupMembers } from './members'
import { fetchCategories } from './categories'
import { isNotFoundError } from './notFound'
import { loadErrorMessage } from './loadErrorMessage'
import { useCoalescedRunner } from './coalescedRunner'
import { createRealtimeRelevance } from './realtimeRelevance'
import { useResync, resyncOnRejoin } from './realtimeResync'

// Everything the bill page (BillView.jsx) shows that comes from the
// database, and keeping it current: the bill with its payers, the group's
// members and categories, and the bill's items, refreshed by realtime
// changes and after a dropped connection. A bill (or group) that's gone
// sends you back with a notice. Item edits (useBillItemActions.js) share
// deletingIdsRef and buyerWritesPendingRef with the item loader here, so
// a reload never undoes an edit still on its way to the server.
export function useBillData({ groupId, billId }) {
  const navigate = useNavigate()

  // Only ever needs the one flag — fetched once alongside the bill/members
  // below, never refetched, since a bill can't change which group it
  // belongs to.
  const [group, setGroup] = useState(null)
  const [bill, setBill] = useState(null)
  const [billPayers, setBillPayers] = useState([]) // the last CONFIRMED multi-payer split, [] if this bill has a single payer
  const [allMembers, setAllMembers] = useState([])
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  // 'loading' until the first successful load — an empty `items` alone can't
  // tell "still loading" apart from "this bill really has no items".
  const [itemsStatus, setItemsStatus] = useState('loading')
  const [error, setError] = useState(null)
  // Ids removed optimistically; a deleted UUID never legitimately comes back.
  const deletingIdsRef = useRef(new Set())
  // How many buyer writes are still pending per item — see
  // useBillItemActions' queueBuyerWrite.
  const buyerWritesPendingRef = useRef(new Map())
  // Which realtime events concern this bill — see realtimeRelevance.js.
  const relevanceRef = useRef(createRealtimeRelevance())

  const loadItems = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('items')
      .select('*, item_shares(member_id, shares)')
      .eq('bill_id', billId)
      .order('created_at', { ascending: true })
    if (loadError) {
      // Leaves the currently-shown items alone rather than blanking the
      // whole receipt to "no items yet" on a transient network failure —
      // this runs after nearly every mutation on this page, so that would
      // otherwise be an easy way to make a real receipt look empty.
      setError(loadErrorMessage(loadError))
      setItemsStatus((status) => (status === 'ready' ? 'ready' : 'error'))
      return
    }
    // A load that started before an optimistic delete landed would otherwise
    // put the just-removed row back on screen. Likewise, an item whose buyer
    // writes are still queued keeps the buyers shown on screen — the server
    // is mid-way through catching up (see queueBuyerWrite, which reloads
    // once they're done).
    setItems((current) =>
      (data || [])
        .filter((it) => !deletingIdsRef.current.has(it.id))
        .map((it) => {
          if (!buyerWritesPendingRef.current.has(it.id)) return it
          const shown = current.find((c) => c.id === it.id)
          return shown ? { ...it, item_shares: shown.item_shares } : it
        })
    )
    setItemsStatus('ready')
    relevanceRef.current.learn([{ id: billId, items: data || [] }])
  }, [billId])

  const loadBill = useCallback(async () => {
    // Used for realtime updates only — the note being typed lives in
    // BillDetails and only takes the bill's note when a bill first loads,
    // so a bill_payers change from elsewhere never clobbers it.
    const { data: billData, error: loadError } = await supabase
      .from('bills')
      .select('*, bill_payers(member_id, amount)')
      .eq('id', billId)
      .single()
    if (loadError) {
      // This fires from the bills-table realtime subscription below, so a
      // 0-row result specifically means the bill was just deleted — by you
      // in another tab, or by someone else in the group — while this page
      // was still open on it. Bouncing back to the group rather than
      // leaving this page sitting on a bill that no longer exists (its
      // note/payer fields still editable, an item list that'll only ever
      // come back empty).
      if (isNotFoundError(loadError)) {
        navigate(`/groups/${groupId}`, { state: { notice: 'This bill was deleted.' } })
        return
      }
      setError(loadErrorMessage(loadError))
      return
    }
    setBill(billData)
    setBillPayers(billData?.bill_payers || [])
  }, [billId, groupId, navigate])

  // See coalescedRunner.js — realtime handlers schedule(), this page's own
  // writes call refreshItems().
  const itemsRunner = useCoalescedRunner(loadItems)
  const billRunner = useCoalescedRunner(loadBill)
  const refreshItems = itemsRunner.now

  // Catches whatever realtime didn't deliver — see realtimeResync.js.
  const resyncBill = useCallback(() => {
    itemsRunner.schedule()
    billRunner.schedule()
  }, [itemsRunner, billRunner])
  useResync(resyncBill)

  useEffect(() => {
    async function loadBillAndMembers() {
      setError(null)
      try {
        // Run in parallel and land in one setState pass, rather than four
        // sequential awaits each committing its own render — the "paid by"/
        // "split with" rows only ever show once `group` is known (never for
        // the split second beforehand where its absence would otherwise
        // read as "not personal, go ahead and show them"), but a fetch that
        // lagged behind the others still meant those rows flashed visible
        // then vanished the instant it caught up. Fetching everything
        // together removes that lag rather than just papering over it.
        // fetchAllGroupMembers/fetchCategories already throw on failure
        // (see lib/members.js, lib/categories.js) — the try/catch below is
        // what actually catches that, rather than leaving an unhandled
        // rejection that silently aborts this effect with the page stuck
        // showing nothing and no error.
        const [billResult, allMembersData, categoriesData, groupResult] = await Promise.all([
          supabase.from('bills').select('*, bill_payers(member_id, amount)').eq('id', billId).single(),
          fetchAllGroupMembers(groupId),
          fetchCategories(groupId),
          supabase.from('groups').select('is_personal').eq('id', groupId).single(),
        ])
        // A bill (or, far more rarely, the group itself) that's already
        // gone by the time this page loads — a stale link, a delete that
        // landed just before this one opened it, someone else in the group
        // deleting it — used to surface PostgREST's own raw "JSON object
        // requested, multiple (or no) rows returned" wording here instead
        // of anything a person could make sense of. Bounce back instead,
        // same as the realtime path in loadBill above.
        if (isNotFoundError(billResult.error)) {
          navigate(`/groups/${groupId}`, { state: { notice: 'This bill was deleted.' } })
          return
        }
        if (isNotFoundError(groupResult.error)) {
          navigate('/', { state: { notice: 'This group is no longer available.' } })
          return
        }
        if (billResult.error) throw billResult.error
        if (groupResult.error) throw groupResult.error
        const billData = billResult.data
        setBill(billData)
        setBillPayers(billData?.bill_payers || [])
        setAllMembers(allMembersData)
        setCategories(categoriesData)
        setGroup(groupResult.data)
      } catch (err) {
        setError(loadErrorMessage(err))
      }
    }
    loadBillAndMembers()
    itemsRunner.now()

    // `filter` narrows each subscription to *this* bill specifically —
    // without it, any change to any bill in any group you're a member of
    // (RLS already limits it to those, but not to the one bill you're
    // actually looking at) triggers a refetch here. Only possible where
    // the table has its own bill_id column: items/bill_payers both do.
    // item_shares doesn't (it only carries item_id, one join step further
    // from bill_id), and Realtime's filter can't express a join — that one
    // stays unfiltered at the source, and relevance.isRelevant() drops the
    // share changes that belong to other bills instead. A rejoin after a
    // dropped connection triggers a full resync.
    const relevance = createRealtimeRelevance()
    relevanceRef.current = relevance
    const onItemChange = (table) => (payload) => {
      if (relevance.isRelevant(table, payload)) itemsRunner.schedule()
    }
    const billFilter = `bill_id=eq.${billId}`
    const channel = supabase
      .channel(`bill-${billId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: billFilter }, onItemChange('items'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_shares' }, onItemChange('item_shares'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bill_payers', filter: billFilter }, () =>
        billRunner.schedule()
      )
      .subscribe(resyncOnRejoin(resyncBill))

    return () => supabase.removeChannel(channel)
  }, [billId, groupId, navigate, itemsRunner, billRunner, resyncBill])

  return {
    group,
    bill,
    setBill,
    billPayers,
    setBillPayers,
    allMembers,
    categories,
    items,
    setItems,
    itemsStatus,
    error,
    setError,
    refreshItems,
    deletingIdsRef,
    buyerWritesPendingRef,
  }
}
