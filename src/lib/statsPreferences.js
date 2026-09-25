// Deliberately plain localStorage, not synced via Supabase — same
// reasoning as scan settings and the currency/theme choices already in
// this app: this is a per-device "how I like to look at my own stats"
// preference, not data that needs to follow you to another device.
const STORAGE_KEY = 'spesa-stats-preferences'

const DEFAULTS = {
  // Which TimeRangeSelector tab a stats page opens on — Your Stats and
  // every group's Stats page share this one preference, so it behaves the
  // same everywhere rather than needing to be set separately per page.
  // Always applied with offset 0 (the current week/month/year) —
  // "default" means a granularity, never a specific frozen point in time.
  defaultGranularity: 'month',
  // Where the "Spending thresholds" section sits on Your Stats — 'top'
  // (above the period selector, since a budget's own comparison window is
  // fixed — see budgetPeriod below — and everything else on the page moves
  // with the selector), 'bottom' (after everything else), or 'hidden' (not
  // shown on Your Stats at all; AccountStats.jsx only ever renders it for
  // 'top'/'bottom', so 'hidden' needs no extra branch there — it's just the
  // value neither one matches).
  thresholdsPosition: 'top',
  // Whether Budgets (Settings → Budgets, and the section on Your Stats) are
  // compared against the current calendar week or the current calendar
  // month — see lib/budgetPeriod.js for the full reasoning. Deliberately
  // still just a local preference like everything else here, even though
  // it governs real Supabase-backed data: spending_thresholds.amount is
  // always, unconditionally, a *monthly* figure in the database regardless
  // of this setting — 'week' only changes the unit this device divides
  // that figure into for display and editing, it never rewrites what's
  // actually stored. That's what keeps this safe to leave device-local
  // (no migration, no account-wide sync) — two devices with this set
  // differently are just viewing the same unambiguous monthly number in
  // different units, not disagreeing about what it means.
  budgetPeriod: 'month',
}

export const THRESHOLDS_POSITION_OPTIONS = ['top', 'bottom', 'hidden']

export function getStatsPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

export function setStatsPreferences(partial) {
  const next = { ...getStatsPreferences(), ...partial }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage full or blocked: the change still applies to this visit.
  }
  return next
}
