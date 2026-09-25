// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { monthlyToDisplayAmount, displayToMonthlyAmount, budgetComparisonRange } from './budgetPeriod'
import { getPeriodRange } from './timeRange'

describe('monthlyToDisplayAmount', () => {
  it('passes a monthly amount through unchanged in month mode', () => {
    expect(monthlyToDisplayAmount(250, 'month')).toBe(250)
  })

  it('divides a monthly amount by 4 in week mode', () => {
    expect(monthlyToDisplayAmount(250, 'week')).toBe(62.5)
  })

  it('rounds to the cent when a monthly amount does not divide evenly by 4', () => {
    // 10.10 / 4 = 2.525 exactly — the classic "one cent short of clean"
    // case this preference's own rounding warning is about.
    expect(monthlyToDisplayAmount(10.1, 'week')).toBe(2.53)
  })
})

describe('displayToMonthlyAmount', () => {
  it('passes a typed amount through unchanged in month mode', () => {
    expect(displayToMonthlyAmount(250, 'month')).toBe(250)
  })

  it('multiplies a typed weekly amount by 4', () => {
    expect(displayToMonthlyAmount(62.5, 'week')).toBe(250)
  })

  it('round-trips exactly when the original monthly amount divides evenly by 4', () => {
    const monthly = 180
    const weekly = monthlyToDisplayAmount(monthly, 'week')
    expect(displayToMonthlyAmount(weekly, 'week')).toBe(monthly)
  })

  it('can drift by a cent or two re-saving a weekly amount that was itself already rounded — the documented edge case, not a bug', () => {
    // €10.10/month -> shown as €2.53/week (rounded up from 2.525) -> typing
    // that same displayed figure back in and saving re-multiplies the
    // *rounded* value, landing on €10.12, not the original €10.10. Bounded
    // to a cent or two, and it doesn't compound: a second round trip from
    // €10.12 behaves the same way each time rather than drifting further,
    // since every save starts fresh from whatever's on screen rather than
    // stacking on the previous drift.
    const originalMonthly = 10.1
    const displayedWeekly = monthlyToDisplayAmount(originalMonthly, 'week')
    expect(displayedWeekly).toBe(2.53)
    const resavedMonthly = displayToMonthlyAmount(displayedWeekly, 'week')
    expect(resavedMonthly).toBe(10.12)
    expect(resavedMonthly).not.toBe(originalMonthly)
    expect(Math.abs(resavedMonthly - originalMonthly)).toBeLessThanOrEqual(0.02)
  })
})

describe('budgetComparisonRange', () => {
  it('is the current week when the period is week', () => {
    expect(budgetComparisonRange('week')).toEqual(getPeriodRange('week', 0))
  })

  it('is the current month when the period is month', () => {
    expect(budgetComparisonRange('month')).toEqual(getPeriodRange('month', 0))
  })
})
