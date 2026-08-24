// A tiny in-memory LRU: at most maxEntries keys are kept, and the least
// recently touched one (by either get or set) is evicted first. Backed by a
// plain Map — insertion order doubles as recency order here, since both
// get() and set() delete-then-re-insert the touched key to push it to the
// end.
//
// Deliberately just an in-memory Map, not localStorage/IndexedDB: this
// cache exists to make revisiting a page instant *within* a session (the
// data was already fetched once, why fetch it again five seconds later) —
// it's not meant to survive a reload, and a real fetch (see each cache's
// call site) always still happens in the background on every visit to keep
// it honest. Persisting further than that is a separate, larger decision
// this doesn't try to make.
export function createLruCache(maxEntries = 5) {
  const map = new Map()

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
    },
  }
}
