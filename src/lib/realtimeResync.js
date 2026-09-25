import { useEffect, useRef } from 'react'

// Realtime only delivers changes while connected. A phone suspends the
// socket while the app is in the background, and a dropped connection
// loses whatever happened in between — nothing replays it. Without a
// resync, a page could keep showing stale data until something else
// happened to trigger a reload.

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000
// Ignore quick app switches: the socket usually survives those.
const MIN_HIDDEN_MS = 10 * 1000

// Calls `resync` when the page comes back to the foreground after being
// hidden a while, and on a slow timer while it's visible (hidden tabs are
// skipped — they'll resync when shown again).
export function useResync(resync, { intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  const resyncRef = useRef(resync)
  useEffect(() => {
    resyncRef.current = resync
  }, [resync])

  useEffect(() => {
    let hiddenAt = document.visibilityState === 'hidden' ? Date.now() : null

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      if (hiddenAt !== null && Date.now() - hiddenAt >= MIN_HIDDEN_MS) resyncRef.current()
      hiddenAt = null
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') resyncRef.current()
    }, intervalMs)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      clearInterval(timer)
    }
  }, [intervalMs])
}

// Status callback for channel.subscribe(). realtime-js re-sends the same
// join on every reconnect, so SUBSCRIBED fires again after each drop —
// every SUBSCRIBED after the first means changes may have been missed.
export function resyncOnRejoin(resync) {
  let joined = false
  return (status) => {
    if (status !== 'SUBSCRIBED') return
    if (joined) resync()
    joined = true
  }
}
