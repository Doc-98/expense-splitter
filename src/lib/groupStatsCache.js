import { createLruCache } from './lruCache'

// Same idea and same cap as groupViewCache.js — keyed by group_id, holding
// the raw fetched state GroupStats.jsx derives everything else from. A
// separate cache/namespace from groupViewCache even for the same group,
// since the two pages fetch different shapes of the same underlying data
// and there's no reason to entangle them.
export const groupStatsCache = createLruCache(5)
