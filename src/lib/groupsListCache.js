import { createLruCache } from './lruCache'

// Groups.jsx never had a cache of its own before — every visit to "/",
// refresh included, refetched the groups list from nothing. There's only
// ever one relevant entry (the signed-in account's own list), so a fixed
// key is enough; no need for group-id-style keying. Same sessionStorage
// mirroring as groupViewCache.js/groupStatsCache.js/accountStatsCache.js,
// same reasoning — paint the old list immediately on refresh instead of a
// blank/loading state, then quietly revalidate.
export const groupsListCache = createLruCache(1, 'spesa-cache-groups-list')
export const GROUPS_LIST_CACHE_KEY = 'mine'
