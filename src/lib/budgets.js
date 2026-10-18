import { computeMyCategorySpend, mergeCategorySpend } from './categoryStats'
import { filterByDateRange, sumCategoryDailyInRange } from './timeRange'
import { budgetComparisonRange, monthlyToDisplayAmount } from './budgetPeriod'

// The budget maths both stats pages share: Your Stats' Budgets section
// (any week or month, plus a track record) and a group's own "Your budgets"
// section (this week or month, with how much of it was spent in that
// group). A budget is personal and per category name, across every group,
// so both pages measure the same thing: your own share of spending
// ("consumed", see CLAUDE.md), with groups you've left counted from their
// departure snapshots.

// How many past weeks or months the track record looks back over.
export const BUDGET_TRACK_RECORD_PERIODS = 6

// How far back the Budgets section can step: a year of either, which stays
// inside the history Your Stats loads first (this year and last year).
export const BUDGET_HISTORY_MAX_STEPS = { week: 52, month: 12 }

// A function from a date range to your spend per category name in it
// ({ [lowercased name]: { name, amount } }, as computeMyCategorySpend
// returns), over the bills/items/shares given plus any departure snapshots.
export function makeSpendForRange({ bills, items, itemShares, myParticipantIds, categoryNameById, snapshots = [] }) {
  return function spendForRange({ start, end }) {
    const inRange = filterByDateRange(bills, items, itemShares, start, end)
    const live = computeMyCategorySpend({
      bills: inRange.bills,
      items: inRange.items,
      itemShares: inRange.itemShares,
      myParticipantIds,
      categoryNameById,
    })
    return snapshots.reduce(
      (acc, s) => mergeCategorySpend(acc, sumCategoryDailyInRange(s.daily_totals, start, end)),
      live
    )
  }
}

const keyOf = (threshold) => threshold.category_name.trim().toLowerCase()

// One row per budget, sorted by name: what you spent in that category over
// the period against its cap for that period (spending_thresholds.amount
// is always monthly; see budgetPeriod.js).
export function budgetRows(thresholds, spendByKey, period) {
  return thresholds
    .map((t) => {
      const key = keyOf(t)
      const spent = spendByKey[key]?.amount || 0
      const amount = monthlyToDisplayAmount(Number(t.amount), period)
      return { key, name: t.category_name, spent, amount, over: spent > amount }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

// For each budget, in how many of the `count` weeks or months before the
// current one your spend went over today's cap: { [key]: overCount }. Past
// periods are measured against the budget as it is now, since only the
// current amount is stored.
export function budgetTrackRecord(thresholds, spendForRange, period, count = BUDGET_TRACK_RECORD_PERIODS) {
  const record = Object.fromEntries(thresholds.map((t) => [keyOf(t), 0]))
  for (let offset = -1; offset >= -count; offset--) {
    const rows = budgetRows(thresholds, spendForRange(budgetComparisonRange(period, offset)), period)
    for (const row of rows) if (row.over) record[row.key]++
  }
  return record
}

// "Over in 2 of the last 6 months" / "Within budget all 6 weeks", for the
// track record table.
export function describeTrackRecord(overCount, period, count = BUDGET_TRACK_RECORD_PERIODS) {
  const unit = period === 'week' ? 'weeks' : 'months'
  if (overCount === 0) return `Within budget all ${count} ${unit}`
  return `Over in ${overCount} of the last ${count} ${unit}`
}
