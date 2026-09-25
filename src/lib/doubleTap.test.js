import { describe, expect, it, vi } from 'vitest'
import { createDoubleTap, DOUBLE_TAP_MS } from './doubleTap'

function setup() {
  let clock = 0
  const tap = createDoubleTap(DOUBLE_TAP_MS, () => clock)
  const calls = []
  const tapAt = (time, key) => {
    clock = time
    tap(
      key,
      () => calls.push(['single', key]),
      () => calls.push(['double', key])
    )
  }
  return { tapAt, calls }
}

describe('createDoubleTap', () => {
  it('acts on a single tap straight away', () => {
    const { tapAt, calls } = setup()
    tapAt(0, 'alice')
    expect(calls).toEqual([['single', 'alice']])
  })

  it('reports a second quick tap on the same target as a double', () => {
    const { tapAt, calls } = setup()
    tapAt(0, 'alice')
    tapAt(200, 'alice')
    expect(calls).toEqual([
      ['single', 'alice'],
      ['double', 'alice'],
    ])
  })

  it('treats taps too far apart as two singles', () => {
    const { tapAt, calls } = setup()
    tapAt(0, 'alice')
    tapAt(DOUBLE_TAP_MS + 1, 'alice')
    expect(calls.map(([kind]) => kind)).toEqual(['single', 'single'])
  })

  it('never pairs taps on two different targets', () => {
    const { tapAt, calls } = setup()
    tapAt(0, 'alice')
    tapAt(100, 'bob')
    tapAt(200, 'alice')
    expect(calls.map(([kind]) => kind)).toEqual(['single', 'single', 'single'])
  })

  it('starts over after a double, so a third quick tap is a single', () => {
    const { tapAt, calls } = setup()
    tapAt(0, 'alice')
    tapAt(100, 'alice')
    tapAt(200, 'alice')
    expect(calls.map(([kind]) => kind)).toEqual(['single', 'double', 'single'])
  })

  it('uses the real clock by default', () => {
    vi.useFakeTimers()
    try {
      const tap = createDoubleTap()
      const onDouble = vi.fn()
      tap('alice', () => {}, onDouble)
      vi.advanceTimersByTime(100)
      tap('alice', () => {}, onDouble)
      expect(onDouble).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})
