// Small, hand-drawn icon set — plain inline SVG rather than an icon-font
// or component library dependency, since this app only ever needs a
// handful of them (adding a whole library for 4-5 glyphs would cost far
// more bundle size than it saves in code). Each icon is stroke-based,
// sized via a `size` prop (default 20, matching most inline-with-text
// use), and colored via `currentColor` so it inherits whatever color its
// button/link already has — no separate light/dark theming needed. Every
// icon is `aria-hidden` by default, since it always sits inside a button
// or link that already carries its own accessible label (an `aria-label`,
// or visible text next to it) — the icon is decoration, not the label
// itself.
//
// Kept in one file rather than one-file-per-icon: this small a set is
// easier to scan and keep visually consistent (same stroke width, same
// viewBox) side by side than spread across several files.

export function SearchIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <line x1="16.2" y1="16.2" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// The three-node "Android-style" share glyph — the more platform-neutral
// of the two common "share" icons (the other being the iOS box-with-an-
// arrow-out-the-top), and the one more people would immediately read as
// "share" outside of iOS specifically.
export function ShareIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="6" cy="12" r="2.6" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="5.5" r="2.6" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="18.5" r="2.6" stroke="currentColor" strokeWidth="2" />
      <line x1="8.3" y1="10.8" x2="15.7" y2="6.7" stroke="currentColor" strokeWidth="2" />
      <line x1="8.3" y1="13.2" x2="15.7" y2="17.3" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

export function SettingsIcon({ size = 20, ...props }) {
  const teeth = Array.from({ length: 8 }, (_, i) => i * 45)
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      {teeth.map((deg) => (
        <rect key={deg} x="11" y="1" width="2" height="3.6" rx="0.6" fill="currentColor" transform={`rotate(${deg} 12 12)`} />
      ))}
      <circle cx="12" cy="12" r="7.2" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

export function PieChartIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 12V3a9 9 0 019 9h-9z" fill="currentColor" opacity="0.35" />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 3v9h9" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

// Replaces "See graphs →" (both stats pages) with an icon-only button,
// matching the Share/Stats/Settings convention. A filled area under the
// trend line rather than a bare line — echoes PieChartIcon's own
// shaded-wedge treatment above, so the two read as one family of "stats"
// icons rather than two unrelated glyphs picked separately.
export function LineChartIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M3 17l5-6 4 3 8-9v13H3z" fill="currentColor" opacity="0.3" />
      <path d="M3 17l5-6 4 3 8-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// The single "go back" glyph — replaces every "← Back"/"← Groups" text
// link across the app (see BackButton.jsx, which wraps this in the same
// .icon-btn treatment the header's Share/Stats/Settings icons already
// use). A full shaft-plus-arrowhead rather than a bare chevron — matches
// the visual weight of those other icons (all comparable stroke coverage),
// so it reads clearly on its own without needing top-left position to
// disambiguate it from, say, a collapse toggle.
export function BackArrowIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Mirrors BackArrowIcon's shaft-plus-arrowhead, pointed the other way —
// the inline submit glyph for "Create a new group" / "Add bill" (see the
// `.input-with-submit` pattern in styles.css). A directional "go" glyph
// rather than a checkmark: both of these forms navigate you straight into
// what you just created, so "submit and go" is the more honest read than
// "confirm."
export function ArrowRightIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// The plain three-bar "hamburger" — toggles the Settings page's own side
// nav open/closed (see SettingsNav.jsx). Not reused for anything else; the
// account menu this used to open no longer exists (see AppHeader.jsx).
export function MenuIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// ---------- Settings nav icons ----------
// One glyph per section in SettingsNav.jsx — grouped here together since
// they only ever appear side by side in that one rail, and share a
// slightly lighter visual weight (opacity-based fills instead of solid
// ones) than the header's own Share/Stats/Settings icons above, so a full
// column of them doesn't compete with the section content next to it.

export function ProfileIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="8" r="3.6" stroke="currentColor" strokeWidth="2" />
      <path d="M4.5 20c0-3.9 3.4-6.8 7.5-6.8s7.5 2.9 7.5 6.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function GroupsNavIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="9" cy="8.5" r="3" stroke="currentColor" strokeWidth="2" />
      <path d="M3 19.2c0-3.2 2.7-5.6 6-5.6s6 2.4 6 5.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="17.3" cy="8" r="2.4" stroke="currentColor" strokeWidth="1.6" opacity="0.55" />
      <path d="M15 13.6c2.4.5 4.2 2.4 4.6 4.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
    </svg>
  )
}

// Bars with a dashed cap line — spending (the bars) measured against a
// budget (the line), rather than a generic wallet/coin glyph that says
// "money" without saying "a limit on money."
export function BudgetIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M3 4h18" stroke="currentColor" strokeWidth="1.6" strokeDasharray="1 3" strokeLinecap="round" />
      <rect x="4" y="15" width="5" height="6" rx="1" fill="currentColor" opacity="0.35" />
      <rect x="10.5" y="9" width="5" height="12" rx="1" fill="currentColor" />
      <rect x="17" y="12" width="5" height="9" rx="1" fill="currentColor" opacity="0.35" />
    </svg>
  )
}

export function ScanIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="2.5" y="7" width="19" height="13" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M8 7l1.4-2.4h5.2L16 7" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="12" cy="13.6" r="3.6" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

export function GuideIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 6.2c-1.9-1.4-4.6-1.8-7-1.2v13.4c2.4-.6 5.1-.2 7 1.2 1.9-1.4 4.6-1.8 7-1.2V5c-2.4-.6-5.1-.2-7 1.2z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M12 6.2v13.4" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  )
}

export function UpdatesIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M20 12a8 8 0 10-2.7 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M20.5 6.5V12h-5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function AboutIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="8.3" r="1.15" fill="currentColor" />
      <path d="M12 11.3v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function SignOutIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M9 4H6.5a2 2 0 00-2 2v12a2 2 0 002 2H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M20 12H9.5M15.5 8l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ---------- Group Settings nav icons ----------
// One glyph per section in GroupSettings.jsx's own rail — General and
// Members reuse SettingsIcon/GroupsNavIcon above rather than new glyphs
// (a gear genuinely means "general settings" wherever it appears; a
// group's Members tab is the same "people" concept Settings' own Groups
// section already uses one of), the rest are new.

// A single person, dashed rather than solid — a guest doesn't have an
// account of their own, so the outline itself reads as "temporary/lighter"
// next to ProfileIcon's solid one, without needing a second glyph shape.
export function GuestIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="8" r="3.6" stroke="currentColor" strokeWidth="2" strokeDasharray="2.4 2.6" />
      <path
        d="M4.5 20c0-3.9 3.4-6.8 7.5-6.8s7.5 2.9 7.5 6.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="2.6 3"
      />
    </svg>
  )
}

// A price tag — categories are labels you tag spending with, not a chart
// or a folder, so the glyph itself is the everyday "tag" object rather
// than a generic list/grid icon.
export function TagIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M11.6 3.5H5A1.5 1.5 0 003.5 5v6.6c0 .4.16.78.44 1.06l8.9 8.9c.58.59 1.53.59 2.12 0l6.6-6.6c.59-.59.59-1.54 0-2.12l-8.9-8.9a1.5 1.5 0 00-1.06-.44z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" />
    </svg>
  )
}

// Two arrows chasing each other in a loop — the plainest "this repeats on
// its own" glyph there is, distinct from UpdatesIcon's single refresh
// arrow (that one means "check for something new"; this means "happens
// again automatically").
export function SubscriptionIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4.5 12a7.5 7.5 0 0112.5-5.6M19.5 12a7.5 7.5 0 01-12.5 5.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M17 3.5v3.4h-3.4M7 20.5v-3.4h3.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// A downward arrow landing in an open tray — every row in the Data
// section brings something *in* from outside the app, so an inbox/import
// glyph fits all three (a CSV, a bank statement, or bills waiting to be
// tagged) better than a document icon that says "file" without saying
// which direction it's moving.
export function ImportIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 3.5v11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7.5 10l4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 15v3.5A2 2 0 005.5 20.5h13a2 2 0 002-2V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ---------- Guide nav icons ----------
// One glyph per top-level group in GuideSection.jsx's own rail — Getting
// started/Stats/Your account reuse GroupsNavIcon/PieChartIcon/ProfileIcon
// above (each already means the same thing elsewhere in the app), Sharing
// & importing reuses ShareIcon, Group management reuses SettingsIcon (a
// group's own settings, same glyph as the account Settings page's own
// gear); Bills & splitting and Settling up are new.

// A receipt's own jagged bottom edge is a more specific silhouette than a
// generic document/list icon — reads as "an itemized bill" at a glance,
// which is what this whole group of guide topics is actually about.
export function ReceiptIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M5 3h14v17.5l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3V3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

// Two opposing arrows — money moving back and forth until it nets out,
// rather than a checkmark (which would read as "done" more than "this is
// what settling up means"). Distinct from SubscriptionIcon's own loop
// (that one means "repeats automatically"; this means "balances out").
export function SettleIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M4 8h13M13 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 16H7M11 12l-4 4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// The standard warning triangle — Danger Zone is the one nav item that
// needs to read as "different" at a glance even collapsed to icon-only,
// same reasoning SignOutIcon gets its own warm-colored slot in the
// account Settings rail.
export function DangerIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 3.5L2 20.5h20L12 3.5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12 9.5v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="17.2" r="1.15" fill="currentColor" />
    </svg>
  )
}

// ---------- Scan settings: provider picker ----------
// Three generic capability badges, not real provider logos — this app's
// whole icon set is hand-drawn and logo-free (see the file's own header
// comment), and imitating Google's or Anthropic's actual marks would both
// break that convention and misrepresent an unofficial integration as an
// official one. Gemini and Claude share CloudIcon below (both are "send
// it to a cloud API") — only the delivery mechanism gets its own glyph,
// not the specific service.

export function DeviceIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="7" y="2" width="10" height="20" rx="2" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="18" r="1" fill="currentColor" />
    </svg>
  )
}

export function CloudIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M6.5 18a4 4 0 01-.5-7.97A5.5 5.5 0 0117 9.06 4.5 4.5 0 0116.5 18h-10z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Wi-Fi-style arcs — reads as "your own local network" more clearly than a
// house would (this option means a computer on your LAN, not a place).
export function NetworkIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M4 9a11 11 0 0116 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7.2 12.6a6.5 6.5 0 019.6 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="18" r="1.6" fill="currentColor" />
    </svg>
  )
}

// A bare chevron, no shaft — distinct from ArrowRightIcon's heavier full
// arrow (that one means "submit/go"; this just marks something
// expandable, flipping 90° open the same way any disclosure triangle
// does). New rather than reusing ArrowRightIcon, since rotating a shafted
// arrow 90° would leave a stray line pointing nowhere.
export function ChevronIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function CheckIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M5 13l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// The "+ Add another item" ghost row on a bill's simple one-item view —
// see BillView.jsx.
export function PlusIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
