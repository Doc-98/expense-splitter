import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  peekPendingRedirect,
  pendingRedirectReason,
  savePendingRedirect,
  takePendingRedirect,
} from './pendingRedirect'

const DAY = 24 * 60 * 60 * 1000

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('pending redirect', () => {
  it('survives into another tab (localStorage) and is used up once taken', () => {
    savePendingRedirect('/join/abc123', 1000)
    expect(peekPendingRedirect(2000)).toBe('/join/abc123')
    expect(takePendingRedirect(2000)).toBe('/join/abc123')
    expect(takePendingRedirect(2000)).toBeNull()
  })

  it('expires after a day', () => {
    savePendingRedirect('/claim/tok', 0)
    expect(peekPendingRedirect(DAY)).toBe('/claim/tok')
    expect(takePendingRedirect(DAY + 1)).toBeNull()
    expect(localStorage.length).toBe(0)
  })

  it('ignores anything that is not a path inside the app', () => {
    for (const path of ['//evil.example/x', 'https://evil.example', '/', '/login', null]) {
      savePendingRedirect(path, 0)
      expect(peekPendingRedirect(0)).toBeNull()
    }
    localStorage.setItem('redirectAfterLogin', JSON.stringify({ path: '//evil.example', savedAt: 0 }))
    expect(takePendingRedirect(0)).toBeNull()
    localStorage.setItem('redirectAfterLogin', 'not json')
    expect(takePendingRedirect(0)).toBeNull()
  })

  it('degrades to "nothing saved" when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => savePendingRedirect('/join/abc')).not.toThrow()
    expect(takePendingRedirect()).toBeNull()
  })

  it('names why someone is being asked to sign in', () => {
    expect(pendingRedirectReason('/join/abc')).toBe('join')
    expect(pendingRedirectReason('/claim/tok')).toBe('claim')
    expect(pendingRedirectReason('/groups/1')).toBeNull()
    expect(pendingRedirectReason(null)).toBeNull()
  })
})
