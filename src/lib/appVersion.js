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
  "Invite links now work for friends who've never opened the app — they used to land on a \"page doesn't exist\" error",
  "Opening an invite or guest-claim link while signed out now says why you're being asked to sign in, and takes you straight back to it afterwards — even when a new account has to confirm its email first",
  "The Invite menu on a group's Members page now opens fully on screen",
  "A one-item bill now has its own \"Split with\" right under the amount — no more adding a second item just to choose who's splitting it",
  "\"Add another item\" starts the new item split between the same people as the first, and the bill's default is now labelled \"Next item split with\"",
]
