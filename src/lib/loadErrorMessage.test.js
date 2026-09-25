import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { loadErrorMessage } from './loadErrorMessage'

describe('loadErrorMessage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('turns an exhausted connection pool into a plain "server is busy" message', () => {
    const message = loadErrorMessage({ code: 'PGRST003', message: 'Timed out acquiring connection from connection pool.' })
    expect(message).toBe('The server is busy right now — give it a moment and try again.')
  })

  it('recognizes the pool error by its wording even without a code', () => {
    expect(loadErrorMessage({ message: 'Timed out acquiring connection from connection pool.' })).toContain('server is busy')
  })

  it('treats a statement timeout the same way', () => {
    expect(loadErrorMessage({ code: '57014', message: 'canceling statement due to statement timeout' })).toContain(
      'server is busy'
    )
  })

  it('turns a dropped connection into a connectivity message', () => {
    expect(loadErrorMessage({ message: 'TypeError: Failed to fetch' })).toContain("Couldn't reach the server")
  })

  it('still suggests a refresh for auth-looking errors', () => {
    expect(loadErrorMessage({ message: 'JWT expired' })).toBe('JWT expired — try refreshing the page.')
  })

  it('passes any other message through unchanged', () => {
    expect(loadErrorMessage({ message: 'duplicate key value' })).toBe('duplicate key value')
  })
})
