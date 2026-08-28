// A tiny in-memory LRU: at most maxEntries keys are kept, and the least
// recently touched one (by either get or set) is evicted first. Backed by a
// plain Map — insertion order doubles as recency order here, since both
// get() and set() delete-then-re-insert the touched key to push it to the
// end.
//
// Optionally mirrored to sessionStorage (pass `storageKey`) so a browser
// refresh doesn't lose it — without this, every one of these caches used to
// go back to nothing on refresh, which is exactly the "group list/bill
// list/stats look empty for a second" gap this was built to close: the
// cache-then-revalidate pattern already used everywhere a cache like this
// is read now survives a refresh the same way it already survives
// navigating away and back within a session, painting the old (still
// probably correct) data immediately instead of nothing, then quietly
// replacing it once the real fetch resolves — no separate "diff and patch"
// machinery needed, since every list here is already keyed by id, so
// React only re-renders whatever the real fetch says actually changed.
//
// sessionStorage specifically, not localStorage: this is about surviving
// *this tab's* refresh, not becoming a longer-lived store that could still
// be serving days-old data next time the browser opens — it's gone the
// moment the tab actually closes, same lifetime as the in-memory Map would
// have had anyway if refresh didn't wipe it.
//
// Writes are debounced and size-guarded: a burst of realtime updates (a
// bulk import, several rapid edits) coalesces into one write instead of
// one per change, and a cache entry that's grown too large to serialize
// cheaply (an old, heavily-imported group's full bill history, never
// windowed for the "real" fetch the way the app-boot prefetch is) is
// silently skipped rather than blocking the main thread or throwing a
// quota error — that group just falls back to today's plain
// fetch-then-render on refresh, same as before this existed, while every
// ordinary-sized group gets the full benefit.
const PERSIST_DEBOUNCE_MS = 400
// Comfortably under sessionStorage's typical ~5MB-per-origin quota even
// with several caches sharing it — a generous ceiling for a single cache
// entry, not a target.
const MAX_PERSIST_BYTES = 1_500_000

export function createLruCache(maxEntries = 5, storageKey = null) {
  const map = new Map()
  let persistTimer = null

  if (storageKey) {
    try {
      const raw = sessionStorage.getItem(storageKey)
      const entries = raw ? JSON.parse(raw) : null
      if (Array.isArray(entries)) {
        for (const [key, value] of entries) map.set(key, value)
      }
    } catch {
      // Corrupt or blocked storage — start empty, same as any other fresh
      // tab. Never lets a bad persisted blob break the app.
    }
  }

  function persistNow() {
    if (!storageKey) return
    try {
      const serialized = JSON.stringify(Array.from(map.entries()))
      if (serialized.length > MAX_PERSIST_BYTES) {
        sessionStorage.removeItem(storageKey)
        return
      }
      sessionStorage.setItem(storageKey, serialized)
    } catch {
      // Quota exceeded, storage disabled (some browsers' private mode), or
      // a value that doesn't round-trip through JSON — the in-memory
      // cache keeps working fine for the rest of this tab's life either
      // way, it just won't survive a refresh this one time.
    }
  }

  function schedulePersist() {
    if (!storageKey) return
    clearTimeout(persistTimer)
    persistTimer = setTimeout(persistNow, PERSIST_DEBOUNCE_MS)
  }

  return {
    get(key) {
      if (!map.has(key)) return undefined
      const value = map.get(key)
      map.delete(key)
      map.set(key, value)
      return value
    },
    set(key, value) {
      map.delete(key)
      map.set(key, value)
      if (map.size > maxEntries) {
        map.delete(map.keys().next().value)
      }
      schedulePersist()
    },
    // On sign-out (see AppHeader.jsx) — group/account ids aren't scoped to
    // a particular signed-in account, so on a shared device where a second
    // person signs in on the same tab afterward, leaving these entries (in
    // memory or in sessionStorage) would paint the first person's cached
    // data on screen for however briefly it takes the real fetch to
    // correct it.
    clear() {
      clearTimeout(persistTimer)
      map.clear()
      if (storageKey) {
        try {
          sessionStorage.removeItem(storageKey)
        } catch {
          // Same reasoning as persistNow above — nothing left to clean up
          // if storage isn't writable in the first place.
        }
      }
    },
  }
}
