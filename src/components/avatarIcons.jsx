// The chooseable set of per-person avatar icons — outline glyphs in the
// same stroke-based style as icons.jsx (same viewBox, same currentColor
// convention so they inherit whatever color .avatar/.avatar.active already
// gives them), just a separate file since this is a themed, curated *set*
// people pick from (see avatarIcons.js's AVATAR_ICONS) rather than the
// app's own small functional icon vocabulary. Deliberately plain outlines,
// not colored emoji — this needs to sit inside a 26px .avatar circle next
// to the app's other UI and read as "this app's icon language", not as a
// different, louder visual system dropped on top of it.
//
// Each one is intentionally a simplified, recognizable silhouette rather
// than a literal illustration — legible at 14-16px inside a small circle
// matters far more here than anatomical accuracy.

export function BombIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="10.3" cy="14.8" r="6" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M13.7 10.2c.6-1.1 1.6-1.9 2.8-2.3c-.4 1-.3 2 .3 2.8c1-.4 2.1-.2 2.9.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {[0, 45, 90, 135].map((deg) => (
        <line
          key={deg}
          x1="19.7"
          y1="4.1"
          x2="19.7"
          y2="7.5"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          transform={`rotate(${deg} 19.7 5.8)`}
        />
      ))}
    </svg>
  )
}

export function SnowflakeIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      {[0, 60, 120].map((deg) => (
        <g key={deg} transform={`rotate(${deg} 12 12)`} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <line x1="12" y1="3.5" x2="12" y2="20.5" />
          <path d="M12 7.2l-2.1-1.5M12 7.2l2.1-1.5" />
          <path d="M12 16.8l-2.1 1.5M12 16.8l2.1 1.5" />
        </g>
      ))}
    </svg>
  )
}

export function ShrimpIcon({ size = 20, ...props }) {
  // Traced 1:1 from the user's reference SVG — the path/line data below is
  // copied byte-for-byte from it (only stroke="#000000" -> "currentColor"
  // and the wrapping <g>'s shared attributes moved onto each element), not
  // redrawn or simplified. It already used this exact 24px viewBox.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M15.4091492,18.6986036 L15.5,18.5 C14.6355086,16.4828534 12.4348726,15.3912818 10.3058074,15.9235481 L10,16 C10,17.3807119 11.1192881,18.5 12.5,18.5 C11.1745166,18.5 10.0899613,19.5315359 10.0053177,20.8356243 L10,21 L10.3058074,21.0764519 C12.3639038,21.5909759 14.488879,20.5881138 15.4091492,18.6986036 L15.4091492,18.6986036 Z M15.5,18.5 L16.0876894,15.2677081 C16.3179456,14.0012994 15.5065195,12.7792266 14.25,12.5 C12.7524581,12.1672129 11.2843177,11.7137271 9.85996697,11.1439868 L9.5,11 C7.99008611,10.3960344 7,8.93364462 7,7.3074176 L7,7 L7,7 C5.8954305,7 5,6.1045695 5,5 L5,4 L5,4 L5,5 C5,6.1045695 5.8954305,7 7,7 L10,7 L5,7 C3.8954305,7 3,6.1045695 3,5 L3,3 L3,3 L3,5 C3,6.1045695 3.8954305,7 5,7 L10,7 L10,7 L13.0377855,7 C14.6611857,7 16.2665182,7.34067476 17.75,8 L18.1161292,8.1627241 C19.3050993,8.69115526 20.1844343,9.73773708 20.5,11 C20.822649,12.290596 20.6729809,13.6540381 20.0780456,14.8439089 L20,15 C19.3543116,16.2913768 18.2717937,17.3120884 16.9447292,17.8808303 L15.5,18.5 L15.5,18.5 Z M20.6503318,12.7744367 L20.539997,12.9515358 C19.7452448,14.1659903 18.3449036,14.8965565 16.8438806,14.8027425 L16.1253897,14.7573974 M20.0306873,9.86186454 L18.2226934,11.468717 L18.0277613,11.6323951 C17.033486,12.4205412 15.7520231,12.7531999 14.4999327,12.5481943 M16.8048928,7.6285803 L13.9923496,10.1887731 L13.8143356,10.3419788 C12.6651871,11.2777778 11.1129282,11.5562543 9.70980266,11.0776843 L9.88380266,11.1319241"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line x1="11" y1="9" x2="11.1" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function DuckIcon({ size = 20, ...props }) {
  // Traced and scaled (×0.75, from a 32px reference down to this set's
  // 24px viewBox) straight from a reference stroke icon — its curled
  // head-into-body outline plus its small wing flourish. Two fixes on top
  // of the first trace: the path's start and end point (the chin, at the
  // base of the neck) were two separate points close together rather than
  // exactly coincident, leaving a visible gap — a trailing Z closes it
  // properly. And the added eye landed up near the crown of the head
  // rather than anywhere face-like, reading as a stray mark — removed
  // rather than repositioned, since the reference itself never marks one.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M11.03 12c-1.2-.83-2.03-2.18-2.03-3.75c0-2.63 2.33-4.8 5.03-4.5c1.95.23 3.6 1.8 3.9 3.83c.3 2.03-.75 3.75-2.33 4.65c1.95.6 3.38 2.55 3.08 4.8c-.23 2.33-2.33 3.98-4.65 3.98L9 21c-2.48 0-4.5-1.5-5.25-4.5v-6l.6.45C5.93 12.15 7.8 12.75 9.75 12.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17.4 10.5c1.35-.08 2.63-.68 3.45-1.8L21.75 7.5h-3.75"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CatIcon({ size = 20, ...props }) {
  // Closed triangle ears (not just two open lines) so the silhouette reads
  // clearly on its own, plus a bit more face — bigger eyes and a wider
  // whisker spread — than the first pass had.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M6.6 9.4L4.8 3.6l4.7 3.7z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M17.4 9.4l1.8-5.8l-4.7 3.7z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13.6" r="6.2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9.4" cy="12.8" r="1" fill="currentColor" />
      <circle cx="14.6" cy="12.8" r="1" fill="currentColor" />
      <path d="M11.1 15.9h1.8l-.9 1.1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path
        d="M3.9 15.1h3.4M4.1 16.9l3.3-.8M16.7 15.1h3.4M16.6 16.9l3.3-.8"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function TurtleIcon({ size = 20, ...props }) {
  // Top-down view, redrawn from two traced references that both use the
  // same honeycomb shell pattern (an outer hexagon, a smaller hexagon
  // inside it, and a spoke from each inner vertex out to the matching
  // outer one) — much more "turtle shell" than the first pass's plain
  // oval with three divider lines.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="4" r="1.7" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="11.3" cy="3.7" r="0.3" fill="currentColor" />
      <circle cx="12.7" cy="3.7" r="0.3" fill="currentColor" />
      <path d="M12.6 19.9l-.6 2.3l-.6-2.3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      {/* rotate(±32.5) — the actual angle from the shell's center (12,12.5)
          to each leg, so the oval's long axis lies on the line through the
          center instead of roughly tangent to the shell (the previous pass
          had all four signs backwards). */}
      <ellipse cx="4.3" cy="7.6" rx="1.9" ry="1.2" transform="rotate(32.5 4.3 7.6)" stroke="currentColor" strokeWidth="1.4" />
      <ellipse cx="19.7" cy="7.6" rx="1.9" ry="1.2" transform="rotate(-32.5 19.7 7.6)" stroke="currentColor" strokeWidth="1.4" />
      <ellipse cx="4.3" cy="17.4" rx="1.9" ry="1.2" transform="rotate(-32.5 4.3 17.4)" stroke="currentColor" strokeWidth="1.4" />
      <ellipse cx="19.7" cy="17.4" rx="1.9" ry="1.2" transform="rotate(32.5 19.7 17.4)" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M12 5.3L17.5 8.8L17.5 16.2L12 19.7L6.5 16.2L6.5 8.8Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M12 9.5L14.2 10.9L14.2 14.1L12 15.5L9.8 14.1L9.8 10.9Z M12 9.5L12 5.3 M14.2 10.9L17.5 8.8 M14.2 14.1L17.5 16.2 M12 15.5L12 19.7 M9.8 14.1L6.5 16.2 M9.8 10.9L6.5 8.8"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function BeeIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <ellipse cx="11.5" cy="13.5" rx="4.6" ry="6.1" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7.4 11h8.2M7.1 13.8h8.8M7.4 16.6h8.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <ellipse cx="7" cy="8.7" rx="2.8" ry="1.9" transform="rotate(-25 7 8.7)" stroke="currentColor" strokeWidth="1.5" />
      <ellipse cx="16" cy="8.7" rx="2.8" ry="1.9" transform="rotate(25 16 8.7)" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.7 7.3l-1.2-2M13.3 7.3l1.2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function OctopusIcon({ size = 20, ...props }) {
  // Rounder, fuller mantle than the first pass (a flat-topped dome read
  // too close to jellyfish) plus tentacles that curl back slightly at the
  // tip instead of hanging straight — the two cues that actually separate
  // "octopus" from "jellyfish" in a plain outline this small.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <ellipse cx="12" cy="10.4" rx="6.5" ry="5.8" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9.3" cy="9.4" r="0.9" fill="currentColor" />
      <circle cx="14.7" cy="9.4" r="0.9" fill="currentColor" />
      <path
        d="M6.7 14.6c-.6 1.7-1.6 2.7-1.1 4.5c.3 1 1.4 1.3 1.9.4M9.3 15.6c-.2 2-.9 3.3.1 5c.5.9 1.6.8 1.8-.2M12 15.9v5.6M14.7 15.6c.2 2 .9 3.3-.1 5c-.5.9-1.6.8-1.8-.2M17.3 14.6c.6 1.7 1.6 2.7 1.1 4.5c-.3 1-1.4 1.3-1.9.4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* A couple of suction-cup dots on the front tentacles — the one
          unambiguous "octopus, not jellyfish" cue a plain outline this
          small can still carry. */}
      <circle cx="9.1" cy="17.2" r="0.4" fill="currentColor" />
      <circle cx="9.6" cy="19.6" r="0.4" fill="currentColor" />
      <circle cx="14.9" cy="17.2" r="0.4" fill="currentColor" />
      <circle cx="14.4" cy="19.6" r="0.4" fill="currentColor" />
    </svg>
  )
}

export function ButterflyIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 7.8v11.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="5.6" r="0.9" fill="currentColor" />
      <path d="M10.8 4.5L9.3 2.7M13.2 4.5l1.5-1.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path
        d="M12 9.5c-1.3-3.5-5.4-4.9-7.1-2.8c-1.3 1.9.3 4.7 3.3 5.4c-2.4.9-3.5 3.3-2.1 4.9c1.6 1.7 4.6-.1 5.9-3.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M12 9.5c1.3-3.5 5.4-4.9 7.1-2.8c1.3 1.9-.3 4.7-3.3 5.4c2.4.9 3.5 3.3 2.1 4.9c-1.6 1.7-4.6-.1-5.9-3.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function PufferfishIcon({ size = 20, ...props }) {
  // Bigger body, shorter spikes than the first pass — that one had the
  // spikes doing most of the work and the body reading as an afterthought,
  // the opposite of "puffed up".
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="11" cy="12.6" r="5.5" stroke="currentColor" strokeWidth="1.9" />
      {[0, 36, 72, 108, 144, 180, 216, 252, 288, 324].map((deg) => (
        <line
          key={deg}
          x1="11"
          y1="7.1"
          x2="11"
          y2="5.6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          transform={`rotate(${deg} 11 12.6)`}
        />
      ))}
      <circle cx="9.1" cy="10.8" r="0.9" fill="currentColor" />
      <path d="M8.5 14.9c.9.8 2.1.9 3-.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M16.5 11.6l3.8-2.4l-.5 4.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

export function FlowerIcon({ size = 20, ...props }) {
  // Fuller, rounder petals (closed shapes with real width at the belly)
  // instead of thin sliver outlines — much closer to how flower icons are
  // usually drawn.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      {[0, 72, 144, 216, 288].map((deg) => (
        <path
          key={deg}
          d="M12 11.6c-2.7-1.5-3.4-5-1.9-7.3c.7-1 1.3-1.4 1.9-1.4s1.2.4 1.9 1.4c1.5 2.3.8 5.8-1.9 7.3z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          transform={`rotate(${deg} 12 12)`}
        />
      ))}
      <circle cx="12" cy="12" r="2.1" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

export function LemonIcon({ size = 20, ...props }) {
  // The first pass put the leaf and the bottom nub at the wrong corners —
  // rotate(-25) on this ellipse actually points its long axis from
  // upper-*left* to lower-*right*, not upper-right to lower-left, so both
  // were floating off the fruit's actual tips instead of sitting on them.
  // Fixed here by computing the real tip points instead of eyeballing them.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <ellipse
        cx="12"
        cy="12.6"
        rx="5"
        ry="7"
        transform="rotate(-25 12 12.6)"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      {/* Leaf, attached right at the upper-left tip (9, 6.3) and pointing
          further out along that same axis — a proper pointed almond shape
          plus a center vein, not a blob, now that it's actually attached
          where it should be. */}
      <path
        d="M9 6.3C7.7 6.6 6.6 6 6.3 3.3C7.8 3.4 9.3 4.4 9 6.3Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M8.7 5.9L6.7 3.8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      {/* Small nub at the opposite (lower-right) tip. */}
      <path d="M15 18.9c.9.5 1.9.5 2.7-.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="10.2" cy="10.5" r="0.55" fill="currentColor" />
      <circle cx="13.6" cy="12.9" r="0.55" fill="currentColor" />
      <circle cx="10.8" cy="15.3" r="0.55" fill="currentColor" />
    </svg>
  )
}

export function FireIcon({ size = 20, ...props }) {
  // A single smooth, asymmetric loop (bigger bulge on the bottom-right, a
  // waist near the top-right, a plainer curve on the left) rather than the
  // first pass's inward "carve" meant to suggest an inner flame — that
  // tight S-curve nearly crossed itself and read as a gap in the outline
  // instead of shading. One un-pinched loop is unambiguous at this size.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 2.7C9 6 6 9 6 13.4c0 4.5 3.3 7.6 7.2 7.3c3.3-.3 5.8-3 5.8-6.4c0-2.1-1-3.7-2.2-5c-1.5-2.9-3.5-5.2-4.8-6.6z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      {/* A plain closed teardrop reads as a water drop just as easily as a
          flame — this inner curl is what actually says "fire": a small
          flame-within-the-flame, same idea as a two-tone flame icon but
          drawn as one open stroke instead of a second filled shape, since
          this set stays outline-only throughout. */}
      <path
        d="M12.3 10.2c1.5 1.7 1.8 3.4.7 4.9c-.6.9-1.3 1.6-1.3 2.6c0 1.3 1 2.2 2.1 2.3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function LightningIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M13 2.5L4.5 13.8h5.8L9.4 21.5l9.1-11.8h-6z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function MoonIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M20.2 13.9A8.4 8.4 0 1110.6 4.3a6.7 6.7 0 009.6 9.6z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SunIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="4.3" stroke="currentColor" strokeWidth="1.8" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <line
          key={deg}
          x1="12"
          y1="5"
          x2="12"
          y2="7.4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          transform={`rotate(${deg} 12 12)`}
        />
      ))}
    </svg>
  )
}

// Ordered as the picker grid shows them — id is what's actually stored
// (group_members.avatar_icon / profiles.default_avatar_icon), label is
// only for the aria-label on each picker button.
export const AVATAR_ICONS = [
  { id: 'bomb', label: 'Bomb', Icon: BombIcon },
  { id: 'snowflake', label: 'Snowflake', Icon: SnowflakeIcon },
  { id: 'shrimp', label: 'Shrimp', Icon: ShrimpIcon },
  { id: 'duck', label: 'Duck', Icon: DuckIcon },
  { id: 'cat', label: 'Cat', Icon: CatIcon },
  { id: 'turtle', label: 'Turtle', Icon: TurtleIcon },
  { id: 'bee', label: 'Bee', Icon: BeeIcon },
  { id: 'octopus', label: 'Octopus', Icon: OctopusIcon },
  { id: 'butterfly', label: 'Butterfly', Icon: ButterflyIcon },
  { id: 'pufferfish', label: 'Pufferfish', Icon: PufferfishIcon },
  { id: 'flower', label: 'Flower', Icon: FlowerIcon },
  { id: 'lemon', label: 'Lemon', Icon: LemonIcon },
  { id: 'fire', label: 'Fire', Icon: FireIcon },
  { id: 'lightning', label: 'Lightning', Icon: LightningIcon },
  { id: 'moon', label: 'Moon', Icon: MoonIcon },
  { id: 'sun', label: 'Sun', Icon: SunIcon },
]

export function getAvatarIcon(id) {
  return AVATAR_ICONS.find((a) => a.id === id) || null
}
