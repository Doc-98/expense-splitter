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
  "Easier to read in both light and dark mode: text, links and amounts now have much stronger contrast (WCAG AAA), and outlines around fields, cards and tiles are clearly visible",
  "In dark mode, buttons now use dark text on brighter green and terracotta, so their labels stand out",
  "The selected tab, people who've left a group, and success or error messages no longer rely on a faint shade or fade to tell them apart",
  "Using a keyboard? Every button, link, tab and row now shows the same clear green focus ring, including the guide's search and the amount filter slider, which had none",
  "Prices and quantities you're typing line up digit for digit, and the day headings in the bill list use a proper bold instead of an artificially thickened one",
  "Easier to tap: the \"Split with\" avatars are bigger (all three sizes in Settings went up a step), and icon buttons, links, tabs, switches and the send arrow in text fields now respond to a full fingertip-sized area around them, even where they look the same",
  "New category colors that are easier to see in light and dark mode and easier to tell apart — existing groups using the default colors switch over automatically; custom colors stay as you picked them",
  "Settings > Layout has a new \"Color-blind friendly category colors\" switch, just for this device",
  "The installed app keeps its own typefaces when you're offline, instead of falling back to plain system fonts",
  "What you owe is now a clear red, the partner of the green for what you're owed, and the amount is in bold on both, whether you color the whole balance line or just the amount",
  "Error messages carry a warning sign and use their own rust color, so they never look like a debt; delete buttons use the rust too",
]
