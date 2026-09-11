// Deliberately plain localStorage, not synced via Supabase — same
// reasoning as statsPreferences.js: a per-device "how I like a group page
// to look" preference, not data that needs to follow you to another
// device. One flat, global choice per preference — not per-group —
// since disliking a display element here is a style preference, not a
// per-group judgment call; a per-group toggle would just mean turning it
// off again in every group you open instead of once, for no real benefit.
const STORAGE_KEY = 'spesa-group-view-preferences'

const DEFAULTS = {
  // The "this week / this month" totals at the bottom of a group page.
  showQuickStats: true,
  // A bill row's own "You lent …" / "You borrowed …" / "You are not
  // involved" line — already hidden in the Personal space regardless
  // (see GroupView.jsx), since it never says anything there a personal
  // user doesn't already know.
  showLentBorrowedStatus: true,
  // Off by default — the existing "opening a bill clears your filters"
  // behavior is what every group page has always done, so this stays
  // opt-in rather than changing that out from under anyone who never
  // asked for it. When on, GroupView.jsx keeps its search box and filters
  // exactly as they were across navigating to a bill and back (see
  // groupFilterState.js) instead of resetting them the moment the page
  // remounts.
  stickyFilters: false,
  // The "Split with" avatar circles — BillView.jsx's own default-split row
  // plus each item's in ItemRow.jsx. 'small' is the size these launched
  // at (see AVATAR_SIZE_SPECS below); global rather than per-bill/per-item,
  // same reasoning as the toggles above.
  avatarSize: 'small',
}

export const AVATAR_SIZE_OPTIONS = ['small', 'medium', 'large']

// What each size actually renders as — the icon's own px (handed straight
// to AvatarGlyph's `size` prop) and the CSS modifier class layered onto
// the base .avatar circle (see styles.css). One lookup table so BillView,
// ItemRow, and the Settings size picker can't drift out of sync on what
// "medium" or "large" means.
const AVATAR_SIZE_SPECS = {
  small: { iconPx: 14, className: '' },
  medium: { iconPx: 18, className: 'avatar-md' },
  large: { iconPx: 22, className: 'avatar-lg' },
}

export function avatarSizeSpec(size) {
  return AVATAR_SIZE_SPECS[size] || AVATAR_SIZE_SPECS.small
}

export function getGroupViewPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

export function setGroupViewPreferences(partial) {
  const next = { ...getGroupViewPreferences(), ...partial }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage blocked or full — the toggle just won't persist across
    // visits, same graceful degradation every other localStorage-backed
    // preference in this app already has.
  }
  return next
}
