import { createLruCache } from './lruCache'

// The signed-in account's own default_avatar_icon (Settings > Profile) and,
// separately, a group's own override of it (Group Settings > General) —
// same "paint from cache, then quietly revalidate" pattern as
// settingsGroupsCache.js/budgetsCache.js, closing the same kind of gap:
// without it, both pickers start from a real `null` for the instant
// before their fetch resolves, and AvatarPicker.jsx reads that as "no
// icon" and lights up the initial-letter tile — a visible flash on every
// single visit, worse than the loading gap those other caches fix since
// there's no "Loading…" state here to hide it behind, just the wrong tile
// lit up and then swapped a moment later.
//
// One shared cache for both pickers rather than two, since they store
// genuinely different things (an account-wide default vs a per-group
// override) that can live side by side under different keys just fine —
// ACCOUNT_AVATAR_ICON_CACHE_KEY for the former, a group id for the
// latter. Capped at 6 entries (the account key plus five recently-visited
// groups' overrides), same cap as groupRosterCache.js and friends.
export const avatarIconCache = createLruCache(6, 'spesa-cache-avatar-icon')
export const ACCOUNT_AVATAR_ICON_CACHE_KEY = 'account'
