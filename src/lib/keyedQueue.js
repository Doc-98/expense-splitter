// Runs async tasks one after another per key (tasks for different keys don't
// wait on each other). Used for an item's buyer writes, which must reach the
// server in the order they were made — a double tap sends two within a
// fraction of a second.
//
// enqueue(key, task) never rejects: it resolves to { idle, error } once the
// task has run — `error` is whatever it threw, and `idle` is true when it
// was the last task queued for that key (nothing else waiting behind it),
// i.e. the moment to reload and confirm the final state.
export function createKeyedQueue() {
  const queues = new Map() // key -> { tail, pending }

  return function enqueue(key, task) {
    let entry = queues.get(key)
    if (!entry) {
      entry = { tail: Promise.resolve(), pending: 0 }
      queues.set(key, entry)
    }
    entry.pending++
    const run = entry.tail.then(async () => {
      let error
      try {
        await task()
      } catch (err) {
        error = err
      }
      entry.pending--
      const idle = entry.pending === 0
      if (idle) queues.delete(key)
      return { idle, error }
    })
    entry.tail = run
    return run
  }
}
