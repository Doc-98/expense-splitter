import { describe, it, expect } from 'vitest'
import { toDateInputValue, applyDateInputValue } from './billDate'

describe('toDateInputValue', () => {
  it('formats a timestamp as YYYY-MM-DD using local calendar components', () => {
    const d = new Date(2026, 2, 5, 14, 30) // March 5 2026, local time — month is 0-indexed
    expect(toDateInputValue(d.toISOString())).toBe('2026-03-05')
  })

  it('zero-pads single-digit month and day', () => {
    const d = new Date(2026, 0, 9) // Jan 9 2026
    expect(toDateInputValue(d.toISOString())).toBe('2026-01-09')
  })
})

describe('applyDateInputValue', () => {
  it('changes the calendar day while keeping the existing time-of-day', () => {
    const existing = new Date(2026, 2, 5, 14, 30, 15).toISOString()
    const updated = applyDateInputValue(existing, '2026-03-10')
    const d = new Date(updated)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(2)
    expect(d.getDate()).toBe(10)
    expect(d.getHours()).toBe(14)
    expect(d.getMinutes()).toBe(30)
    expect(d.getSeconds()).toBe(15)
  })

  it('round-trips through toDateInputValue for the same day', () => {
    const existing = new Date(2026, 5, 1, 9, 0).toISOString()
    const updated = applyDateInputValue(existing, '2026-06-01')
    expect(toDateInputValue(updated)).toBe('2026-06-01')
  })
})
