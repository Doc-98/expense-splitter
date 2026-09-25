// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createKeyedQueue } from './keyedQueue'

// A task that finishes only when released, recording when it starts/ends.
function controllable(log, name) {
  let release
  const done = new Promise((resolve) => (release = resolve))
  const task = async () => {
    log.push(`start ${name}`)
    await done
    log.push(`end ${name}`)
  }
  return { task, release }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createKeyedQueue', () => {
  it('runs tasks for the same key strictly one after another, in order', async () => {
    const enqueue = createKeyedQueue()
    const log = []
    const first = controllable(log, 'toggle')
    const second = controllable(log, 'only')
    enqueue('item-1', first.task)
    enqueue('item-1', second.task)
    await flush()
    expect(log).toEqual(['start toggle'])

    // Even if the second write would have been faster, it can't start (let
    // alone land) before the first one is done.
    second.release()
    await flush()
    expect(log).toEqual(['start toggle'])

    first.release()
    await flush()
    expect(log).toEqual(['start toggle', 'end toggle', 'start only', 'end only'])
  })

  it("doesn't make different keys wait on each other", async () => {
    const enqueue = createKeyedQueue()
    const log = []
    const slow = controllable(log, 'item-1')
    enqueue('item-1', slow.task)
    const other = enqueue('item-2', async () => log.push('item-2'))
    await other
    expect(log).toEqual(['start item-1', 'item-2'])
    slow.release()
  })

  it('reports idle only for the last task queued for a key', async () => {
    const enqueue = createKeyedQueue()
    const first = enqueue('item-1', async () => {})
    const second = enqueue('item-1', async () => {})
    expect(await first).toEqual({ idle: false, error: undefined })
    expect(await second).toEqual({ idle: true, error: undefined })
  })

  it('reports a failed task without stopping the ones behind it', async () => {
    const enqueue = createKeyedQueue()
    const failure = new Error('network down')
    const log = []
    const first = enqueue('item-1', async () => {
      throw failure
    })
    const second = enqueue('item-1', async () => log.push('ran anyway'))
    expect(await first).toEqual({ idle: false, error: failure })
    expect(await second).toEqual({ idle: true, error: undefined })
    expect(log).toEqual(['ran anyway'])
  })

  it('starts fresh for a key once it has gone idle', async () => {
    const enqueue = createKeyedQueue()
    await enqueue('item-1', async () => {})
    expect(await enqueue('item-1', async () => {})).toEqual({ idle: true, error: undefined })
  })
})
