import { createLruCache } from './lruCache'

// Keyed by group_id, holding the exact snapshot of state GroupView.jsx
// needs to render immediately. Capped at 5 groups — someone bouncing
// between several groups over a session shouldn't accumulate an
// ever-growing set of cached snapshots, but there's no reason to trim
// what's cached *within* one group (even 1000+ bills is a small amount of
// plain JS to hold onto) — see lruCache.js for the reasoning.
export const groupViewCache = createLruCache(5)
