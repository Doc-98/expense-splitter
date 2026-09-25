import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useResync, resyncOnRejoin } from './realtimeResync'

let visibility = 'visible'
function setVisibility(state) {
  visibility = state
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useResync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    visibility = 'visible'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('resyncs when the page comes back after being hidden a while', () => {
    const resync = vi.fn()
    renderHook(() => useResync(resync))
    setVisibility('hidden')
    vi.advanceTimersByTime(60_000)
    setVisibility('visible')
    expect(resync).toHaveBeenCalledTimes(1)
  })

  it('does not resync on a quick app switch', () => {
    const resync = vi.fn()
    renderHook(() => useResync(resync))
    setVisibility('hidden')
    vi.advanceTimersByTime(3_000)
    setVisibility('visible')
    expect(resync).not.toHaveBeenCalled()
  })

  it('resyncs on a timer while visible, and skips ticks while hidden', () => {
    const resync = vi.fn()
    renderHook(() => useResync(resync, { intervalMs: 1000 }))
    vi.advanceTimersByTime(3000)
    expect(resync).toHaveBeenCalledTimes(3)
    setVisibility('hidden')
    vi.advanceTimersByTime(5000)
    expect(resync).toHaveBeenCalledTimes(3)
  })

  it('stops everything on unmount', () => {
    const resync = vi.fn()
    const { unmount } = renderHook(() => useResync(resync, { intervalMs: 1000 }))
    unmount()
    setVisibility('hidden')
    vi.advanceTimersByTime(60_000)
    setVisibility('visible')
    expect(resync).not.toHaveBeenCalled()
  })
})

describe('resyncOnRejoin', () => {
  it('ignores the first SUBSCRIBED and resyncs on every one after it', () => {
    const resync = vi.fn()
    const onStatus = resyncOnRejoin(resync)
    onStatus('SUBSCRIBED')
    expect(resync).not.toHaveBeenCalled()
    onStatus('CHANNEL_ERROR')
    onStatus('SUBSCRIBED')
    onStatus('TIMED_OUT')
    onStatus('SUBSCRIBED')
    expect(resync).toHaveBeenCalledTimes(2)
  })

  it('ignores every non-SUBSCRIBED status', () => {
    const resync = vi.fn()
    const onStatus = resyncOnRejoin(resync)
    onStatus('CLOSED')
    onStatus('CHANNEL_ERROR')
    onStatus('SUBSCRIBED')
    expect(resync).not.toHaveBeenCalled()
  })
})
