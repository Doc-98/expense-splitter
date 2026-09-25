// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parseNumber, parseAmount } from './parseNumber'

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

describe('parseAmount', () => {
  it('passes a plain number straight through, unrounded, same as parseNumber', () => {
    expect(parseAmount('42')).toBe(42)
    expect(parseAmount('3,50')).toBe(3.5)
    expect(parseAmount('1.005')).toBe(1.005)
  })

  it('evaluates the exact case this was built for', () => {
    expect(parseAmount('2,30-1,25')).toBe(1.05)
    expect(parseAmount('2.30-1.25')).toBe(1.05)
  })

  it('supports +, -, *, / with standard precedence', () => {
    expect(parseAmount('2+3*4')).toBe(14)
    expect(parseAmount('(2+3)*4')).toBe(20)
    expect(parseAmount('9/3')).toBe(3)
  })

  it('supports unary minus, including after another operator', () => {
    expect(parseAmount('-5+2')).toBe(-3)
    expect(parseAmount('5*-2')).toBe(-10)
  })

  it('mixes comma and dot decimals freely across one expression', () => {
    expect(parseAmount('2.5+1,5')).toBe(4)
  })

  it('rounds the evaluated result to the cent, correcting binary float drift', () => {
    // 0.1 + 0.2 is 0.30000000000000004 in raw floating point — this is
    // exactly the kind of artifact this rounding step exists to hide.
    expect(parseAmount('0,1+0,2')).toBe(0.3)
  })

  it('tolerates surrounding and interior whitespace', () => {
    expect(parseAmount(' 2 + 3 ')).toBe(5)
  })

  it('treats division by zero as invalid input, not Infinity', () => {
    expect(parseAmount('5/0')).toBeNaN()
  })

  it('rejects an incomplete or malformed expression', () => {
    expect(parseAmount('2+')).toBeNaN()
    expect(parseAmount('(2+3')).toBeNaN()
    expect(parseAmount('2+3)')).toBeNaN()
    expect(parseAmount('()')).toBeNaN()
  })

  it('still returns NaN for plain garbage', () => {
    expect(parseAmount('not a number')).toBeNaN()
    expect(parseAmount(null)).toBeNaN()
  })
})
