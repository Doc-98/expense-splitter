// Turns a set of bills/items into "how much was spent per category" — kept
// separate from settlement.js entirely, since nothing here is about who
// owes whom, just where the money went.
//
// An item's *effective* category is its own category_id if it has one
// (the per-item override), otherwise its bill's category_id (the common
// case — one tag covers the whole receipt), otherwise 'uncategorized'.
export function computeCategoryTotals({ bills, items }) {
  const billById = new Map(bills.map((b) => [b.id, b]))
  const totals = {}

  for (const item of items) {
    const bill = billById.get(item.bill_id)
    const categoryId = item.category_id || bill?.category_id || 'uncategorized'
    totals[categoryId] = (totals[categoryId] || 0) + Number(item.total_price)
  }

  for (const key of Object.keys(totals)) {
    totals[key] = Math.round(totals[key] * 100) / 100
  }

  return totals
}
