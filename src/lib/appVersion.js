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
  'Fixed the app slowing to a crawl — deletes not working, bills opening empty, "connection pool" errors — right after scanning a receipt, especially with the app open on more than one device. Each open page now reloads once per batch of changes instead of once per changed row, balances are computed about 30× faster, and a group's bill list loads in one quick request instead of several slow ones',
  'Removing an item is now instant: it disappears on the first tap (and comes back with a message if the removal fails), instead of seeming to do nothing while the server catches up',
  'A bill whose items are still loading now says "Loading items…" instead of looking empty',
]
