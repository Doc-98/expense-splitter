// Given a granularity and an offset from the current period (0 = current
// period, -1 = previous, -2 = the one before that, etc.), returns the
// [start, end) boundaries for that period plus a human-readable label.
// 'all' has no boundaries at all — everything is included.
export function getPeriodRange(granularity, offset) {
  const now = new Date()

  if (granularity === 'week') {
    const day = now.getDay() // 0 = Sunday .. 6 = Saturday
    const diffToMonday = (day === 0 ? -6 : 1) - day
    const currentMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday)
    const start = new Date(currentMonday.getFullYear(), currentMonday.getMonth(), currentMonday.getDate() + offset * 7)
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)
    const lastDay = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1)
    const label = `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${lastDay.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
    // Week is the one granularity whose label has no year in it at all
    // (month spells it out, "August 2026"; year obviously is one) — a
    // week's own short date range reads as ambiguous once you're more
    // than a few months from today, so callers show this alongside the
    // label instead of folding it in, to keep the two visually distinct
    // rather than a longer, harder-to-scan single string. A week that
    // crosses a year boundary (e.g. Dec 29 – Jan 4) shows both years.
    const yearLabel =
      start.getFullYear() === lastDay.getFullYear()
        ? String(start.getFullYear())
        : `${start.getFullYear()}–${lastDay.getFullYear()}`
    return { start, end, label, yearLabel }
  }

  if (granularity === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1)
    const label = start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    return { start, end, label }
  }

  if (granularity === 'year') {
    const start = new Date(now.getFullYear() + offset, 0, 1)
    const end = new Date(now.getFullYear() + offset + 1, 0, 1)
    const label = String(start.getFullYear())
    return { start, end, label }
  }

  return { start: null, end: null, label: 'All time' }
}

// Same calendar-anchored, offset-paged idea as getPeriodRange, but for a
// fixed *span* of consecutive months rather than one calendar unit — used
// by the spending-graphs page's "Last N months" tab, where a single month
// or a whole year are already exactly what getPeriodRange itself covers.
// offset steps by one whole span at a time (offset -1 = the monthCount
// months immediately before the current span, contiguous with it, no gap
// or overlap) — same "page a whole period, not one unit within it"
// convention as month/year already use elsewhere in this app.
//
// offset 0's span always *ends* on the current calendar month (inclusive)
// — e.g. monthCount=4 in August gives May–August — since "last 4 months"
// means "up to and including now," not a span that stops short of it.
export function getMultiMonthRange(monthCount, offset) {
  const now = new Date()
  const endMonthIndex = now.getMonth() + offset * monthCount // 0-based, relative to now's year; may fall outside 0-11
  const start = new Date(now.getFullYear(), endMonthIndex - monthCount + 1, 1)
  const end = new Date(now.getFullYear(), endMonthIndex + 1, 1)
  const lastMonth = new Date(end.getFullYear(), end.getMonth() - 1, 1)

  const startLabel = start.toLocaleDateString(undefined, { month: 'short' })
  const endLabel = lastMonth.toLocaleDateString(undefined, { month: 'short' })
  const label =
    start.getFullYear() === lastMonth.getFullYear()
      ? `${startLabel} – ${endLabel} ${start.getFullYear()}`
      : `${startLabel} ${start.getFullYear()} – ${endLabel} ${lastMonth.getFullYear()}`

  return { start, end, label }
}

// How far back a stats page's *first* fetch reaches, before it backfills
// the rest of a group's history in the background — a whole current
// calendar year plus a whole previous calendar year. That's chosen because
// it's a superset of what every granularity's current-vs-previous
// comparison (see comparePeriods/canCompare) ever needs: week and month
// comparisons trivially fit inside a single year, and year's own
// comparison needs exactly "this year plus last year," which is precisely
// this boundary. Only 'all' time, or paging back further than a year,
// reaches past it — see isViewCovered below, which is how a page decides
// whether it's safe to trust what's fetched so far.
export function getStatsWindowStart(now = new Date()) {
  return new Date(now.getFullYear() - 1, 0, 1)
}

// Whether granularity/offset's own period — and its "previous period"
// comparison, if it has one — are both fully inside [windowStart, now).
// A page uses this to decide whether the numbers it can currently compute
// (from whatever's been fetched so far) are trustworthy as final, or
// whether they'd be silently missing bills older than the window and
// should be shown as still-loading instead. 'all' always needs the full
// history, so it's never "covered" by any bounded window.
export function isViewCovered(granularity, offset, windowStart) {
  if (granularity === 'all') return false
  const { start } = getPeriodRange(granularity, offset)
  if (!start) return false
  const { start: prevStart } = getPeriodRange(granularity, offset - 1)
  const earliestNeeded = prevStart && prevStart < start ? prevStart : start
  return earliestNeeded >= windowStart
}

// Narrows a bills/items/itemShares dataset down to only what falls inside
// [start, end). Passing nulls (the 'all time' case) returns everything
// unchanged.
export function filterByDateRange(bills, items, itemShares, start, end) {
  if (!start && !end) return { bills, items, itemShares }

  const filteredBills = bills.filter((b) => {
    const t = new Date(b.created_at).getTime()
    return (!start || t >= start.getTime()) && (!end || t < end.getTime())
  })
  const billIds = new Set(filteredBills.map((b) => b.id))
  const filteredItems = items.filter((it) => billIds.has(it.bill_id))
  const itemIds = new Set(filteredItems.map((it) => it.id))
  const filteredItemShares = itemShares.filter((s) => itemIds.has(s.item_id))

  return { bills: filteredBills, items: filteredItems, itemShares: filteredItemShares }
}

// Sums a departure snapshot's day-keyed totals ('YYYY-MM-DD' -> {paid,
// consumed}) that fall inside [start, end). Reconstructing each key back
// into a comparable instant has to use the same local-time construction
// getPeriodRange() itself uses for its boundaries, or the two won't line up
// for anyone outside UTC.
export function sumDailyInRange(daily, start, end) {
  let paid = 0
  let consumed = 0
  for (const [dateKey, v] of Object.entries(daily || {})) {
    const [y, m, d] = dateKey.split('-').map(Number)
    const t = new Date(y, m - 1, d).getTime()
    if (start && t < start.getTime()) continue
    if (end && t >= end.getTime()) continue
    paid += v.paid
    consumed += v.consumed
  }
  return { paid: Math.round(paid * 100) / 100, consumed: Math.round(consumed * 100) / 100 }
}

// Same idea as sumDailyInRange, but for a snapshot's per-day *category*
// breakdown — returns { normalizedKey: { name, amount } }, the same shape
// computeMyCategorySpend() returns, so the two can be combined directly
// (see mergeCategorySpend() in categoryStats.js). A day with no `categories`
// key at all — every snapshot recorded before this breakdown existed —
// simply contributes nothing here; its paid/consumed still counts via
// sumDailyInRange above, just not attributed to any category.
export function sumCategoryDailyInRange(daily, start, end) {
  const totals = {}
  for (const [dateKey, v] of Object.entries(daily || {})) {
    const [y, m, d] = dateKey.split('-').map(Number)
    const t = new Date(y, m - 1, d).getTime()
    if (start && t < start.getTime()) continue
    if (end && t >= end.getTime()) continue
    for (const [name, amount] of Object.entries(v.categories || {})) {
      const key = name.trim().toLowerCase()
      if (!totals[key]) totals[key] = { name: name.trim(), amount: 0 }
      totals[key].amount += amount
    }
  }
  for (const key of Object.keys(totals)) {
    totals[key].amount = Math.round(totals[key].amount * 100) / 100
  }
  return totals
}

// Rolls a departure snapshot's daily totals up into month buckets
// ('YYYY-MM' -> paid), for merging into a "by month" chart alongside live
// groups' data.
export function monthlyFromDaily(daily) {
  const monthly = {}
  for (const [dateKey, v] of Object.entries(daily || {})) {
    const key = dateKey.slice(0, 7)
    monthly[key] = (monthly[key] || 0) + v.paid
  }
  return monthly
}
