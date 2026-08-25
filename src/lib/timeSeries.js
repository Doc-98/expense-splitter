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
// ('day'), one per Monday-anchored calendar week ('week'), or one per
// calendar month ('month'). Every day/week/month in the range gets a point
// even with zero data (amount: 0), so a line chart's x-axis never has a
// silent gap where one is just missing rather than genuinely zero.
//
// `categoryKey` reads one specific category's amount out of each bucket
// instead of the day's/week's/month's total — personal callers pass a
// category *name* (computeDailyTotalsForUser buckets by name, so the same
// category merges across groups, same reasoning as computeMyCategorySpend),
// group callers pass a category *id* (computeDailyTotalsForGroup buckets by
// id, same as computeCategoryTotals). This function doesn't care which kind
// of string it's given, it just looks the key up — omit it (or pass null)
// for every category combined.
export function buildSeries(daily, { start, end, granularity, categoryKey = null }) {
  if (granularity === 'day') {
    const points = []
    for (let d = new Date(start); d < end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      const key = toDateInputValue(d)
      // The 1st of a month gets "Aug 1" instead of a bare "1" — this
      // granularity can span several months (the "Last 4 months" tab), and
      // a bare day-of-month number repeats every month with nothing to
      // tell them apart otherwise.
      const label =
        d.getDate() === 1 ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : String(d.getDate())
      points.push({ key, label, amount: round2(amountFor(daily[key], categoryKey)) })
    }
    return points
  }

  if (granularity === 'week') {
    // Monday-anchored, same convention getPeriodRange('week', ...) already
    // uses — a week straddling `start` or `end` (the first/last week of a
    // year almost always does, since Jan 1 is rarely a Monday) still gets
    // exactly one point, just summed only over the days actually inside
    // [start, end), not the full calendar week either side of it.
    const points = []
    const startDay = start.getDay()
    const diffToMonday = (startDay === 0 ? -6 : 1) - startDay
    let weekStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() + diffToMonday)
    while (weekStart < end) {
      const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7)
      const sumFrom = new Date(Math.max(weekStart.getTime(), start.getTime()))
      const sumUntil = new Date(Math.min(weekEnd.getTime(), end.getTime()))
      let amount = 0
      for (let d = sumFrom; d < sumUntil; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
        amount += amountFor(daily[toDateInputValue(d)], categoryKey)
      }
      points.push({
        key: toDateInputValue(weekStart),
        label: weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        amount: round2(amount),
      })
      weekStart = weekEnd
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

// The finest granularity the line chart offers — one point per actual
// transaction, for the "This month" view — doesn't fit buildSeries()'s
// "one point per fixed calendar unit" model at all (a day/week/month
// always exists and gets a point even at zero; a "transaction" only
// exists when there's an actual bill, or — for a departed group, which
// has no bill-level record left, only a frozen daily total — an actual
// day something was spent). So this takes already-assembled records
// instead of a day-keyed map: each caller works out its own "amount per
// transaction" (a bill's own total, a person's share of one, a category
// filter applied to either) since that math genuinely differs between the
// group and personal pages, then this just filters to the visible range,
// drops anything at zero (a zero-amount "transaction" — usually a bill
// with nothing in the currently-selected category — isn't a meaningful
// point the way a zero-spend *day* still is in the other granularities;
// showing every irrelevant bill as a flat dot at zero would just be
// noise), and sorts chronologically.
//
// `records` is `[{ key, date: Date, amount: number }]`, in any order.
export function buildBillPoints(records, { start, end }) {
  return records
    .filter((r) => r.amount > 0 && r.date >= start && r.date < end)
    .sort((a, b) => a.date - b.date)
    .map((r) => ({
      key: r.key,
      label: r.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      amount: round2(r.amount),
    }))
}
