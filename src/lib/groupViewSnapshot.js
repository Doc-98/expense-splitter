import { deriveBillsItemsShares } from './deriveBillData'
import { computeSpendingTotals } from './settlement'
import { getPeriodRange, filterByDateRange } from './timeRange'

// The group page's bill list — every bill row with nested items (each with
// item_shares) and bill_payers, newest first — in one call to the
// get_group_bills RPC (see supabase/migrations/20260925020000_group_bills_rpc.sql).
// Same shape the page used to request from PostgREST's embedded select, but
// ~10x cheaper for the database. `since` (a Date) limits it to bills
// created at or after that moment, for the fast first-paint window;
// `billIds` to just those bills, for per-bill updates (see billPatches.js).
// Shared with prefetchGroup.js so the warm-up asks for exactly the same shape.
export async function fetchGroupBills(supabase, groupId, { since, billIds } = {}) {
  const args = { target_group_id: groupId }
  if (since) args.since = since.toISOString()
  if (billIds) args.bill_ids = billIds
  const { data, error } = await supabase.rpc('get_group_bills', args)
  if (error) throw error
  return data || []
}

// The same for several groups at once (Your Stats/Graphs) — one call per
// group, all in parallel; each bill carries its own group_id.
export async function fetchBillsForGroups(supabase, groupIds, options) {
  const perGroup = await Promise.all(groupIds.map((groupId) => fetchGroupBills(supabase, groupId, options)))
  return perGroup.flat()
}

// Pulled out of GroupView.jsx's own computeAndSetSettlement (per-bill
// personal totals and the week/month preview totals) so the exact same
// derivation can run twice: once for real on mount, and once ahead of time
// during the app-boot warm-up (see prefetchGroup.js) — without those two
// call sites drifting apart. Pure — takes the bills already fetched,
// returns the derived shape, no state setters, no network of its own.
//
// The group's own simplified settlement/balance deliberately does NOT come
// from here anymore — see fetchGroupSettlement() in groupBalances.js. That
// one number is computed server-side, from the group's complete history,
// regardless of how much of it billsData actually covers — this function
// only ever derives from whatever bills it's handed, which used to make it
// an easy way to compute a *wrong* balance from a partial/windowed fetch
// (see loadRecentBillsForFirstPaint's own comment in GroupView.jsx for the
// bug that actually caused). Safe to still call this with a windowed bill
// list for a fast preview — billPersonalTotals/week/monthTotal were never
// the problem, only the balance was.
export function computeGroupViewSnapshot(billsData) {
  const { list: settlementBills, items, itemShares } = deriveBillsItemsShares(billsData)

  // Grouped once up front — filtering the full item/share lists per bill
  // was bills × items work (~4M comparisons on the largest group) on
  // every reload.
  const itemsByBill = new Map()
  for (const item of items) {
    if (!itemsByBill.has(item.bill_id)) itemsByBill.set(item.bill_id, [])
    itemsByBill.get(item.bill_id).push(item)
  }
  const sharesByItem = new Map()
  for (const share of itemShares) {
    if (!sharesByItem.has(share.item_id)) sharesByItem.set(share.item_id, [])
    sharesByItem.get(share.item_id).push(share)
  }

  const billPersonalTotals = {}
  for (const bill of settlementBills) {
    const billItems = itemsByBill.get(bill.id) || []
    const billItemShares = billItems.flatMap((it) => sharesByItem.get(it.id) || [])
    billPersonalTotals[bill.id] = computeSpendingTotals({ bills: [bill], items: billItems, itemShares: billItemShares })
  }

  const thisWeek = getPeriodRange('week', 0)
  const thisMonth = getPeriodRange('month', 0)
  const weekBills = filterByDateRange(settlementBills, items, [], thisWeek.start, thisWeek.end)
  const monthBills = filterByDateRange(settlementBills, items, [], thisMonth.start, thisMonth.end)
  const weekTotal = weekBills.items.reduce((sum, it) => sum + Number(it.total_price), 0)
  const monthTotal = monthBills.items.reduce((sum, it) => sum + Number(it.total_price), 0)

  return { billPersonalTotals, weekTotal, monthTotal }
}
