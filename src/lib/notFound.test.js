// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { isNotFoundError } from './notFound'

describe('isNotFoundError', () => {
  it('recognizes PostgREST\'s "0 (or multiple) rows" code', () => {
    expect(isNotFoundError({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })).toBe(true)
  })

  it('treats every other error code as a real error, not a deleted row', () => {
    expect(isNotFoundError({ code: '23503', message: 'foreign key violation' })).toBe(false)
    expect(isNotFoundError({ code: 'PGRST301', message: 'JWT expired' })).toBe(false)
  })

  it('is false for null/undefined errors, rather than throwing', () => {
    expect(isNotFoundError(null)).toBe(false)
    expect(isNotFoundError(undefined)).toBe(false)
  })
})
