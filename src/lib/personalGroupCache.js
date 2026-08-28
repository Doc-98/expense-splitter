// Session-only cache of the current account's personal group id (see
// get_or_create_personal_group() in schema.sql). There's only ever one
// value worth holding — one personal group per account — so this is a
// plain module-level variable, not the keyed LRU groupViewCache.js/
// groupStatsCache.js use for a whole set of groups.
//
// The point: once the Personal tab (Groups.jsx) has resolved the id once,
// every later click just navigates straight to /groups/:id instead of
// round-tripping through the RPC again first — that page's own
// groupViewCache/groupStatsCache already make everything *after* that
// navigation instant, this just closes the one gap before it. Not
// persisted beyond this session, same reasoning as those two caches (see
// lruCache.js): it exists to make a revisit instant, not to be a source of
// truth — get_or_create_personal_group() is exactly as cheap to fall back
// to as a plain lookup whenever this is empty (a fresh session, or an
// account that's never opened the tab before).
let personalGroupId = null

export function getCachedPersonalGroupId() {
  return personalGroupId
}

export function setCachedPersonalGroupId(id) {
  personalGroupId = id
}

// Called on sign-out (see AppHeader.jsx) — this is a bare module-level
// variable with no account scoping of its own, so on a shared device where
// a second person signs in on the same tab afterward, leaving it set would
// silently send them straight into the *first* person's personal group id
// instead of ever resolving (or creating) their own.
export function clearCachedPersonalGroupId() {
  personalGroupId = null
}
