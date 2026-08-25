import { toDateInputValue } from './billDate'

function round2(n) {
  return Math.round(n * 100) / 100
}

function amountFor(bucket, categoryKey) {
  if (!bucket) return 0
  if (categoryKey) return bucket.categories?.[categoryKey] || 0
  return bucket.total ?? bucket.consumed ?? 0
}

// Turns a day-keyed totals map — computeDailyTotalsForUser() (settlement.js)
// or computeDailyTotalsForGroup() (categoryStats.js), both keyed by the same
// toDateInputValue() "YYYY-MM-DD" local-calendar format — into an ordered
// array of chart points spanning [start, end). One point per calendar day
// when granularity is 'day', one per calendar month when 'month'. Every
// day/month in the range gets a point even with zero data (amount: 0), so a
// line chart's x-axis never has a silent gap where a day/month is just
// missing rather than genuinely zero.
//
// `categoryKey` reads one specific category's amount out of each bucket
// instead of the day's/month's total — personal callers pass a category
// *name* (computeDailyTotalsForUser buckets by name, so the same category
// merges across groups, same reasoning as computeMyCategorySpend), group
// callers pass a category *id* (computeDailyTotalsForGroup buckets by id,
// same as computeCategoryTotals). This function doesn't care which kind of
// string it's given, it just looks the key up — omit it (or pass null) for
// every category combined.
export function buildSeries(daily, { start, end, granularity, categoryKey = null }) {
  if (granularity === 'day') {
    const points = []
    for (let d = new Date(start); d < end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      const key = toDateInputValue(d)
      points.push({ key, label: String(d.getDate()), amount: round2(amountFor(daily[key], categoryKey)) })
    }
    return points
  }

  // granularity === 'month' — one pass to bucket every in-range day into
  // its month, then a second walk to actually emit one point per month
  // (including months with nothing in `daily` at all).
  const byMonth = new Map()
  for (const [key, bucket] of Object.entries(daily)) {
    const [y, m, day] = key.split('-').map(Number)
    const t = new Date(y, m - 1, day)
    if (t < start || t >= end) continue
    const monthKey = `${y}-${String(m).padStart(2, '0')}`
    byMonth.set(monthKey, (byMonth.get(monthKey) || 0) + amountFor(bucket, categoryKey))
  }

  const points = []
  for (
    let d = new Date(start.getFullYear(), start.getMonth(), 1);
    d < end;
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  ) {
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    points.push({
      key: monthKey,
      label: d.toLocaleDateString(undefined, { month: 'short' }),
      amount: round2(byMonth.get(monthKey) || 0),
    })
  }
  return points
}
