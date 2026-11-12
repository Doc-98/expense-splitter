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
  "Importing a bank statement now reads its details column (\"Dettagli\", \"Memo\", \"Notes\") and shows it on each transaction, along with your bank's own category",
  "Category suggestions on an import use those details and your bank's category as hints, not as the answer, and each one says where it came from",
  'A merchant you have filed under the same category before keeps that category on the next import',
  "With an AI set up, an import no longer asks you to match your bank's category names first",
]
