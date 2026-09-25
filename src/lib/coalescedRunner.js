import { useEffect, useRef, useState } from 'react'

// Realtime sends one event per changed row, so a single receipt scan arrives
// as ~60 events at once. Reloading once per event is what exhausted the
// database's connection pool. This collapses any burst into at most one run
// in flight plus one queued behind it.
//   schedule() — for realtime handlers: waits for the burst to settle.
//   now()      — after the user's own write: no delay, still single-flight,
//                so an older response can't land after a newer one.
export function createCoalescedRunner(task, delayMs = 300) {
  let timer = null
  let running = false
  let rerun = false
  let disposed = false

  async function execute() {
    timer = null
    if (disposed) return
    if (running) {
      rerun = true
      return
    }
    running = true
    try {
      await task()
    } catch (err) {
      // Tasks handle their own errors; this only keeps `running` from wedging.
      console.error(err)
    } finally {
      running = false
      if (rerun && !disposed) {
        rerun = false
        execute()
      }
    }
  }

  return {
    schedule() {
      if (disposed || timer) return
      timer = setTimeout(execute, delayMs)
    },
    now() {
      if (disposed) return
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      execute()
    },
    dispose() {
      disposed = true
      rerun = false
      if (timer) clearTimeout(timer)
      timer = null
    },
    revive() {
      disposed = false
    },
  }
}

// Stable per component instance (safe in effect deps), always calling the
// latest `task`. revive() covers StrictMode's mount/unmount/mount cycle.
export function useCoalescedRunner(task, delayMs) {
  const taskRef = useRef(task)
  useEffect(() => {
    taskRef.current = task
  }, [task])
  const [runner] = useState(() => createCoalescedRunner(() => taskRef.current(), delayMs))
  useEffect(() => {
    runner.revive()
    return () => runner.dispose()
  }, [runner])
  return runner
}
