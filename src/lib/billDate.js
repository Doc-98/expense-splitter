// Bills don't have a separate "date" column — `created_at` already doubles
// as the bill's date everywhere in the app (sorting, month/day grouping,
// stats), including for imported bills, whose `created_at` is deliberately
// set to the historical date rather than the moment the import ran. Editing
// it after the fact (see the click-to-edit date in BillView.jsx) is
// consistent with that existing convention, not a new one — no migration
// needed, just a plain UPDATE on the column that was already doing this job.

// Formats a timestamp as the "YYYY-MM-DD" a native <input type="date">
// needs for its `value`, using local calendar components — the same
// local-time convention already used everywhere else a date gets bucketed
// in this app (see dateGroups.js, timeRange.js), so this always shows the
// same day a person would see on the bill list, never off by one because
// of a UTC/local mismatch near midnight.
export function toDateInputValue(dateStr) {
  const d = new Date(dateStr)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Applies a new "YYYY-MM-DD" (from that same date input) on top of an
// existing timestamp, keeping its time-of-day rather than resetting to
// midnight — picking a different day for a bill shouldn't also silently
// change where it falls relative to other bills added the same day, and a
// pile of bills all landing exactly on midnight would look faintly odd on
// its own. Returns an ISO string ready to write straight to `created_at`.
export function applyDateInputValue(currentDateStr, newDateInputValue) {
  const [y, m, day] = newDateInputValue.split('-').map(Number)
  const existing = new Date(currentDateStr)
  return new Date(y, m - 1, day, existing.getHours(), existing.getMinutes(), existing.getSeconds()).toISOString()
}
