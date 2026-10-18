import { createLruCache } from './lruCache'

// Remembers a group page's search box/filters exactly as they were left,
// across navigating away and back (opening a bill, then hitting Back) —
// only ever consulted when the "Sticky filters" preference (see
// groupViewPreferences.js) is on; useBillFilters.js decides whether to seed
// its own state from this on mount, and writes back to it on every change
// while the preference stays on. Deliberately no sessionStorage mirror
// (unlike most of this file's siblings) — this is meant to survive
// ordinary in-app navigation, not an actual page refresh; a refresh
// clearing it back to nothing is the expected, simpler behavior, not a
// bug to work around.
export const groupFilterStateCache = createLruCache(10)
