// "1.<PR number>" rather than semver, since PRs merge in order on this
// branch and are already a visible, monotonic counter of what's shipped
// (cross-referenceable against GitHub directly). Computed automatically at
// build time (see vite.config.js) from the latest squash-merge commit's
// message — every PR here is squash-merged, and GitHub always appends
// " (#123)" to that commit's own subject, so there's nothing left to bump
// by hand or for it to drift out of sync with. Read by AppHeader.jsx's
// brand chip and by the Settings > Updates section — one source of truth
// for both.
export const APP_VERSION = import.meta.env.VITE_APP_VERSION

// A short, synthetic recap of what changed in the current APP_VERSION —
// not a full changelog (that's what git history/GitHub is for), just
// enough for "what's new" on the Updates section. Unlike APP_VERSION
// itself, this stays editorial and hand-maintained (there's no reliable
// way to summarize "what a human would care about" from a commit message
// alone) — replace this list with each PR that ships something visible.
export const WHATS_NEW = [
  "Swipe-to-remove is fixed: bills on the group page now slide all the way (they barely moved before), rows follow your finger smoothly, a quick flick is enough to reveal Remove, a row never gets stuck half-open, and the first tap after a swipe always registers",
  'Removing an item is now a trash-can button on the right of the item\'s details',
  'A bill\'s details (including who new items are split with) now start open',
  'Double-tap someone in a "Split with" row to make them the only one splitting — on each item and on the bill\'s default for new items',
]
