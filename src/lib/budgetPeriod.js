import { getPeriodRange } from './timeRange'

// Deliberately the one place both halves of "budgets can be weekly or
// monthly" live — the amount conversion (used by BudgetsSection.jsx to
// show/save a cap) and the comparison window (used by AccountStats.jsx to
// decide how much counts as "spent so far"). Keeping both here, rather
// than each page reimplementing its own half, is what stops a weekly cap
// from ever silently getting compared against a month of spending: there's
// only one function to call for "what period is spending measured over"
// and one pair for "what does this amount look like," not two independent
// judgment calls that could drift apart.
//
// spending_thresholds.amount in the database is always, unconditionally, a
// monthly figure — this preference (statsPreferences.js's own
// `budgetPeriod`) never rewrites what's actually stored there. It only
// changes the unit *this device* currently displays and edits it in. That
// makes the preference safe to keep purely local (no account-wide sync,
// no migration): the stored number's meaning never depends on which
// device, or which of a device's own past settings, happens to be reading
// it — two devices showing "week" and "month" are just displaying the same
// unambiguous monthly fact in different units, the same way °C and °F
// never disagree about the actual temperature.
export const BUDGET_PERIOD_OPTIONS = ['week', 'month']

const MULTIPLIER = { week: 4, month: 1 }

function round2(n) {
  return Math.round(n * 100) / 100
}

// monthlyAmount straight from spending_thresholds.amount -> whatever this
// device should show for the current period. Rounds to the cent, same as
// every other money value in this app — a monthly amount that doesn't
// divide evenly by 4 (e.g. €10.10) can't be shown to the exact quarter-cent,
// so this is the one place that rounding is unavoidable. See
// displayToMonthlyAmount's own comment for what that implies on save.
export function monthlyToDisplayAmount(monthlyAmount, period) {
  return round2(monthlyAmount / MULTIPLIER[period])
}

// The inverse, for turning what someone just typed back into the monthly
// figure that actually gets saved. Not a perfect round-trip when the
// on-screen amount came from a monthly figure that didn't divide evenly by
// 4 in the first place (see monthlyToDisplayAmount) — re-saving a weekly
// amount that was itself already rounded can shift the stored monthly
// total by a cent or two, never more, and never compounding across
// multiple saves (each one re-derives from whatever's freshly typed, not
// from the previous rounding). BudgetsSection.jsx surfaces a short warning
// about exactly this, rather than silently letting it happen unexplained.
export function displayToMonthlyAmount(displayAmount, period) {
  return round2(displayAmount * MULTIPLIER[period])
}

// The date range "spent so far" is measured over when comparing against a
// budget's own cap — always the *current* one (no offset), the same way
// the caps themselves are never for a past or future period.
export function budgetComparisonRange(period) {
  return getPeriodRange(period, 0)
}
