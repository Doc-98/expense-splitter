import { createLruCache } from './lruCache'

// Keyed by the account's user id, not a group id — there's only ever one
// "Your Stats" page per signed-in user, so in the common case this cache
// holds exactly one entry. The cap still guards against the edge case of
// signing out and into a different account in the same tab without a full
// reload, which would otherwise leave a stale entry behind for the old
// account forever (small, but no reason not to bound it the same way as
// groupViewCache/groupStatsCache).
export const accountStatsCache = createLruCache(5)
