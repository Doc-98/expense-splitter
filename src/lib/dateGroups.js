// Groups a list of items (anything with a `created_at` string/Date) into
// month sections, each containing day sub-sections — the "20 August" /
// "August 2026" divider structure on the group page's bill list, styled
// after how Splitwise groups its own activity feed.
//
// Assumes the input is already sorted by date (the bill list always is —
// see GroupView.jsx's `.order('created_at', ...)`) and just walks it once,
// starting a new month/day group whenever the calendar month/day actually
// changes rather than resorting anything itself. That means the order of
// the returned month/day groups — and which one ends up "first" — is
// whatever order the caller's list was already in; reverse the input first
// for oldest-first grouping.
//
// Month/day boundaries use the browser's local calendar (plain
// getFullYear/getMonth/getDate on a local `Date`), matching what a person
// looking at their phone actually means by "today" — the same convention
// already used for the date pickers and formatting elsewhere in the app,
// rather than normalizing to UTC.
export function groupItemsByDate(items, dateKey = 'created_at') {
  const monthGroups = []
  let currentMonthKey = null
  let currentMonthGroup = null
  let currentDayKey = null
  let currentDayGroup = null

  for (const item of items) {
    const date = new Date(item[dateKey])
    const monthKey = `${date.getFullYear()}-${date.getMonth()}`
    const dayKey = `${monthKey}-${date.getDate()}`

    if (monthKey !== currentMonthKey) {
      currentMonthGroup = {
        key: monthKey,
        label: date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        days: [],
      }
      monthGroups.push(currentMonthGroup)
      currentMonthKey = monthKey
      currentDayKey = null // force a fresh day group under the new month too
    }

    if (dayKey !== currentDayKey) {
      currentDayGroup = {
        key: dayKey,
        label: String(date.getDate()),
        items: [],
      }
      currentMonthGroup.days.push(currentDayGroup)
      currentDayKey = dayKey
    }

    currentDayGroup.items.push(item)
  }

  return monthGroups
}
