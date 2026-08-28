import { createLruCache } from './lruCache'

// Same idea, same cap, and same sessionStorage mirroring as
// groupViewCache.js — keyed by group_id, holding the raw fetched state
// GroupStats.jsx derives everything else from. A separate cache/namespace
// from groupViewCache even for the same group, since the two pages fetch
// different shapes of the same underlying data and there's no reason to
// entangle them (including in storage — a separate key each).
export const groupStatsCache = createLruCache(5, 'spesa-cache-group-stats')
