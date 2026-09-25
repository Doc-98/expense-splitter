import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createCoalescedRunner } from './coalescedRunner'

function deferred() {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('createCoalescedRunner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('collapses a burst of 60 scheduled signals into a single run', async () => {
    const task = vi.fn(() => Promise.resolve())
    const runner = createCoalescedRunner(task, 300)
    for (let i = 0; i < 60; i++) runner.schedule()
    expect(task).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(300)
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('runs exactly once more when signals arrive while a run is in flight', async () => {
    const first = deferred()
    const task = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined)
    const runner = createCoalescedRunner(task, 300)

    runner.now()
    expect(task).toHaveBeenCalledTimes(1)

    // A whole burst lands while the first run is still waiting on the server.
    for (let i = 0; i < 40; i++) runner.schedule()
    await vi.advanceTimersByTimeAsync(300)
    runner.now()
    runner.now()
    expect(task).toHaveBeenCalledTimes(1)

    first.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(task).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(task).toHaveBeenCalledTimes(2)
  })

  it('never has more than one run in flight at a time', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const pending = []
    const task = vi.fn(() => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      const d = deferred()
      pending.push(d)
      return d.promise.then(() => {
        inFlight--
      })
    })
    const runner = createCoalescedRunner(task, 50)

    runner.now()
    runner.now()
    runner.schedule()
    await vi.advanceTimersByTimeAsync(50)
    pending[0].resolve()
    await vi.advanceTimersByTimeAsync(0)
    runner.now()
    pending[1].resolve()
    await vi.advanceTimersByTimeAsync(0)
    pending[2]?.resolve()
    await vi.advanceTimersByTimeAsync(0)

    expect(maxInFlight).toBe(1)
  })

  it('now() skips the delay of an already-scheduled run instead of adding another', async () => {
    const task = vi.fn(() => Promise.resolve())
    const runner = createCoalescedRunner(task, 300)
    runner.schedule()
    runner.now()
    expect(task).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(300)
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('does nothing after dispose — no pending timer fires, no queued rerun starts', async () => {
    const first = deferred()
    const task = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined)
    const runner = createCoalescedRunner(task, 300)

    runner.now()
    runner.schedule()
    await vi.advanceTimersByTimeAsync(300) // queues a rerun behind the in-flight one
    runner.schedule()
    runner.dispose()
    first.resolve()
    await vi.advanceTimersByTimeAsync(1000)
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('keeps working after a task throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const task = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined)
    const runner = createCoalescedRunner(task, 0)
    runner.now()
    await vi.advanceTimersByTimeAsync(0)
    runner.now()
    await vi.advanceTimersByTimeAsync(0)
    expect(task).toHaveBeenCalledTimes(2)
  })

  it('works again after revive() (StrictMode remount)', async () => {
    const task = vi.fn(() => Promise.resolve())
    const runner = createCoalescedRunner(task, 0)
    runner.dispose()
    runner.now()
    expect(task).not.toHaveBeenCalled()
    runner.revive()
    runner.now()
    expect(task).toHaveBeenCalledTimes(1)
  })
})
