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
  'Free OCR can now read a PDF receipt directly — no AI key needed. Reads a digital PDF\'s real text straight away, or falls back to scanning it like a photo if it turns out to be a scan',
  'Budgets can now be weekly or monthly (Settings > Budgets) — existing amounts adjust automatically when you switch',
  'Settings > Layout: tap a setting to see a live preview of what it actually changes, right there on the page',
  'Budgets position on Your Stats gained a third option, Hidden, alongside Top and Bottom',
  "Fixed Settle up sometimes silently hiding an error about the group itself failing to load, if your balances happened to finish loading right after",
]
