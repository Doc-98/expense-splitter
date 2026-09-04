import { describe, it, expect } from 'vitest'
import { splitEvenly } from './splitEvenly'

describe('splitEvenly', () => {
  it('splits an amount that divides evenly', () => {
    expect(splitEvenly(9, 3)).toEqual([3, 3, 3])
  })

  it('never drifts off the original total once shares are rounded to cents', () => {
    // $10 / 3 = $3.3333... — a naive independent-rounding split would give
    // 3.33 x 3 = 9.99, a cent short of the real total.
    const shares = splitEvenly(10, 3)
    const sum = shares.reduce((a, b) => a + b, 0)
    expect(Math.round(sum * 100) / 100).toBe(10)
  })

  it('gives the leftover cent(s) to the first share(s), not the last', () => {
    expect(splitEvenly(10, 3)).toEqual([3.34, 3.33, 3.33])
  })

  it('handles an amount smaller than the number of shares', () => {
    // 1 cent split 3 ways: one person gets it, the other two get nothing.
    expect(splitEvenly(0.01, 3)).toEqual([0.01, 0, 0])
  })

  it('returns an empty array for zero or negative n', () => {
    expect(splitEvenly(10, 0)).toEqual([])
    expect(splitEvenly(10, -1)).toEqual([])
  })

  it('handles a single share (the whole amount, unchanged)', () => {
    expect(splitEvenly(12.34, 1)).toEqual([12.34])
  })
})
