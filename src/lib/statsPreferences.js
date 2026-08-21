// Deliberately plain localStorage, not synced via Supabase — same
// reasoning as scan settings and the currency/theme choices already in
// this app: this is a per-device "how I like to look at my own stats"
// preference, not data that needs to follow you to another device.
const STORAGE_KEY = 'spesa-stats-preferences'

const DEFAULTS = {
  // Which TimeRangeSelector tab Your Stats opens on. Always applied with
  // offset 0 (the current week/month/year) — "default" means a granularity,
  // never a specific frozen point in time.
  defaultGranularity: 'month',
  // Where the "Spending thresholds" section sits on Your Stats — 'top'
  // (above the period selector, since thresholds are always this-month and
  // everything else on the page moves with the selector) or 'bottom'
  // (after everything else).
  thresholdsPosition: 'top',
}

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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}
