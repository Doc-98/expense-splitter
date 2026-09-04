import { describe, it, expect } from 'vitest'
import { parseNumber } from './parseNumber'

describe('parseNumber', () => {
  it('parses a plain integer or decimal', () => {
    expect(parseNumber('42')).toBe(42)
    expect(parseNumber('3.5')).toBe(3.5)
  })

  it('treats a comma as the decimal separator', () => {
    expect(parseNumber('3,50')).toBe(3.5)
    expect(parseNumber('0,99')).toBe(0.99)
  })

  it('trims surrounding whitespace', () => {
    expect(parseNumber('  12.5  ')).toBe(12.5)
  })

  it('accepts a real number as-is', () => {
    expect(parseNumber(7)).toBe(7)
  })

  it('returns NaN for null/undefined/garbage', () => {
    expect(parseNumber(null)).toBeNaN()
    expect(parseNumber(undefined)).toBeNaN()
    expect(parseNumber('not a number')).toBeNaN()
  })

  it('treats an empty/whitespace-only string as 0, same as Number() does', () => {
    expect(parseNumber('')).toBe(0)
    expect(parseNumber('   ')).toBe(0)
  })
})
