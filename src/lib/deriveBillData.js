// Turns a raw Supabase bills response (each bill carrying nested items,
// each item carrying nested item_shares, plus bill_payers) into the flat
// { list, items, itemShares } shape every stats page's settlement/category
// math is built on. Pulled out on its own so a stats page can call this
// twice — once for its fast initial window of bills, once again for the
// combined [window + backfilled history] set — without duplicating the
// unpacking loop, and re-deriving from the *combined* raw rows rather than
// trying to merge two already-derived results (simpler, and there's no risk
// of double-counting a bill that happened to straddle both fetches, since
// there's nothing to reconcile — it's a fresh derivation each time).
export function deriveBillsItemsShares(rawBillsData) {
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
  return { list, items, itemShares }
}
