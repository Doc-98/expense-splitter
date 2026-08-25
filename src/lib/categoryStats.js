import { toDateInputValue } from './billDate'

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

// One person's own proportional share of spending per category *name* —
// the money math behind spending thresholds (see src/pages/Thresholds.jsx
// and the "By category" budgets on Your Stats). Two things make this
// different from computeCategoryTotals above: it's scoped to one person's
// item_shares allocation rather than an item's whole total_price, and it
// buckets by category *name* (trimmed, case-insensitive) rather than
// category_id — the same name from two different groups' categories tables
// (different UUIDs) is meant to count as the same budget.
//
// myParticipantIds is a Set of every group_members.id that's "me" across
// however many groups these items span — group_members.id values never
// collide between groups, so membership in this one set is enough to
// identify "my" share on an item without this function needing to know
// anything about which group an item's bill belongs to.
//
// categoryNameById resolves a category_id to its raw name — an item's
// *effective* category is its own category_id if set, otherwise its bill's,
// otherwise 'Uncategorized', same fallback rule as computeCategoryTotals.
export function computeMyCategorySpend({ bills, items, itemShares, myParticipantIds, categoryNameById }) {
  const billById = new Map(bills.map((b) => [b.id, b]))
  const sharesByItem = new Map()
  for (const share of itemShares) {
    if (!sharesByItem.has(share.item_id)) sharesByItem.set(share.item_id, [])
    sharesByItem.get(share.item_id).push(share)
  }

  const totals = {} // lowercased trimmed name -> { name, amount }

  for (const item of items) {
    const shares = sharesByItem.get(item.id) || []
    const totalShares = shares.reduce((sum, s) => sum + Number(s.shares), 0)
    if (totalShares <= 0) continue

    const myShares = shares
      .filter((s) => myParticipantIds.has(s.user_id))
      .reduce((sum, s) => sum + Number(s.shares), 0)
    if (myShares <= 0) continue

    const bill = billById.get(item.bill_id)
    const categoryId = item.category_id || bill?.category_id || null
    const rawName = categoryId ? categoryNameById.get(categoryId) : null
    const name = rawName ? rawName.trim() : 'Uncategorized'
    const key = name.toLowerCase()

    const myPortion = (Number(item.total_price) * myShares) / totalShares
    if (!totals[key]) totals[key] = { name, amount: 0 }
    totals[key].amount += myPortion
  }

  for (const key of Object.keys(totals)) {
    totals[key].amount = Math.round(totals[key].amount * 100) / 100
  }

  return totals
}

// Combines two { normalizedKey: { name, amount } } maps into one — the
// shape both computeMyCategorySpend() (live groups) and
// sumCategoryDailyInRange() (departed groups' snapshots, see
// src/lib/timeRange.js) return, so a personal category total can include
// both without either function needing to know the other exists. Where a
// key exists in both, amounts are summed and the *first* map's name wins
// (callers should pass live data first) — live data's current casing/color
// lookup is preferable to a snapshot's frozen name when both are available,
// but a snapshot-only category (one you left before you had any live
// spending on it this period) still needs a name to display, hence falling
// back to its own.
export function mergeCategorySpend(first, second) {
  const merged = {}
  for (const [key, v] of Object.entries(first)) {
    merged[key] = { name: v.name, amount: v.amount }
  }
  for (const [key, v] of Object.entries(second)) {
    if (merged[key]) {
      merged[key].amount = Math.round((merged[key].amount + v.amount) * 100) / 100
    } else {
      merged[key] = { name: v.name, amount: v.amount }
    }
  }
  return merged
}

// The whole-group counterpart of computeDailyTotalsForUser()
// (settlement.js) — same "bucket by local calendar day" idea, feeding the
// spending-graphs line/pie charts (src/pages/GroupGraphs.jsx), but with no
// notion of "mine": every item's full total_price counts, on whichever day
// its bill falls, regardless of who paid or who it's split with. Bucketed
// by category *id* rather than name (see computeCategoryTotals above) —
// this is always scoped to one group's own categories table, unlike the
// personal version, which has to merge the same category name across
// several different groups' tables.
//
// Uses toDateInputValue() (billDate.js) for the day key rather than
// reimplementing the same "YYYY-MM-DD, local calendar" formatting a second
// time — every other day-bucketed dataset in this app (this one included)
// needs to agree on that exact format to line up when combined or compared.
export function computeDailyTotalsForGroup({ bills, items }) {
  const billById = new Map(bills.map((b) => [b.id, b]))
  const daily = {}

  for (const item of items) {
    const bill = billById.get(item.bill_id)
    if (!bill) continue
    const key = toDateInputValue(bill.created_at)
    if (!daily[key]) daily[key] = { total: 0, categories: {} }

    const amount = Number(item.total_price)
    daily[key].total += amount
    const categoryId = item.category_id || bill.category_id || 'uncategorized'
    daily[key].categories[categoryId] = (daily[key].categories[categoryId] || 0) + amount
  }

  for (const key of Object.keys(daily)) {
    daily[key].total = Math.round(daily[key].total * 100) / 100
    for (const categoryId of Object.keys(daily[key].categories)) {
      daily[key].categories[categoryId] = Math.round(daily[key].categories[categoryId] * 100) / 100
    }
  }

  return daily
}
