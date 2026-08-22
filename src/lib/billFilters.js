// Pure filtering logic for the group bill list's search/tag/price controls
// — kept separate from GroupView.jsx, same convention as csv.js/recapText.js,
// so each piece is testable standalone before ever touching a component.

// Case-insensitive substring match against a bill's title and note
// together — same shape as the in-app guide's own search (Guide.jsx): one
// plain .includes() check on lowercased text, not a per-word split, so a
// fragment like "read" still matches "Sourdough bread" via the title alone
// even if the note has nothing to do with it.
export function matchesSearch(bill, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = `${bill.title || ''} ${bill.note || ''}`.toLowerCase()
  return haystack.includes(q)
}

// A bill's effective set of tags — every item's own category if set, else
// the bill's own category, else the synthetic 'uncategorized' bucket (same
// literal key computeCategoryTotals() in categoryStats.js already uses for
// this, so a bill with only untagged items is still filterable rather than
// silently invisible to every tag filter). A bill with no items at all
// (an empty draft nobody finished) contributes no tags either way.
export function getBillTagIds(bill) {
  const ids = new Set()
  for (const item of bill.items || []) {
    ids.add(item.category_id || bill.category_id || 'uncategorized')
  }
  return ids
}

// matchMode 'all': the bill must contain every selected tag, each
// satisfied by at least one item — not necessarily the same item, since an
// item only ever carries one effective category anyway, so "the same item
// covering two tags" could never happen in this data model regardless.
// matchMode 'any': the bill must contain at least one of the selected
// tags. The two modes agree whenever zero or one tag is selected.
export function matchesTags(bill, selectedTagIds, matchMode) {
  if (!selectedTagIds || selectedTagIds.size === 0) return true
  const billTagIds = getBillTagIds(bill)
  if (matchMode === 'all') {
    for (const tagId of selectedTagIds) {
      if (!billTagIds.has(tagId)) return false
    }
    return true
  }
  for (const tagId of selectedTagIds) {
    if (billTagIds.has(tagId)) return true
  }
  return false
}

// Summed fresh from a bill's items rather than trusted from anywhere else
// — GroupView's bill rows don't otherwise carry a precomputed total.
export function billTotal(bill) {
  return (bill.items || []).reduce((sum, item) => sum + Number(item.total_price), 0)
}

export function matchesPriceRange(total, min, max) {
  if (min != null && total < min) return false
  if (max != null && total > max) return false
  return true
}

// Combines all three — a bill has to pass every active filter to appear.
// Each filter is a no-op when "unset" (empty query, no tags selected,
// min/max both null), so this degrades cleanly back to "show everything"
// with nothing configured, same as landing on the page before ever
// touching the filter panel.
export function filterBills(bills, { query = '', tagIds, tagMode = 'any', minPrice, maxPrice } = {}) {
  return bills.filter(
    (bill) =>
      matchesSearch(bill, query) &&
      matchesTags(bill, tagIds, tagMode) &&
      matchesPriceRange(billTotal(bill), minPrice, maxPrice)
  )
}
