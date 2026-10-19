import { createLruCache } from './lruCache'

// The signed-in account's own default_avatar_icon (Settings > Profile) —
// same "paint from cache, then quietly revalidate" pattern as
// settingsGroupsCache.js/budgetsCache.js, closing the same kind of gap:
// without it, the picker starts from a real `null` for the instant before
// its fetch resolves, and AvatarPicker.jsx reads that as "no icon" and
// lights up the initial-letter tile — a visible flash on every single
// visit, with no "Loading…" state to hide it behind. (Someone's avatar in
// one group is part of the group roster instead, see groupRosterCache.js.)
// Keyed by ACCOUNT_AVATAR_ICON_CACHE_KEY; the small cap is left over from
// when per-group overrides were cached here too.
export const avatarIconCache = createLruCache(6, 'spesa-cache-avatar-icon')
export const ACCOUNT_AVATAR_ICON_CACHE_KEY = 'account'
