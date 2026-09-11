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
  // Traced 1:1 from the user's own redraw (made on iPad with Apple Pencil
  // in Linearity Curve) — path data unchanged, just stroke="#000000" ->
  // "currentColor" and camelCase attribute names for JSX.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M9.4375 8.34375C6.12379 8.34375 3.4375 11.03 3.4375 14.3438C3.4375 17.6575 6.12379 20.3438 9.4375 20.3438C12.7512 20.3437 15.4375 17.6575 15.4375 14.3438C15.4375 11.03 12.7512 8.34375 9.4375 8.34375Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />
      <path
        d="M12.85 9.75C12.9206 9.62053 12.9968 9.49523 13.0781 9.37423"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M18.85 3.65L18.85 7.05" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="miter" />
      <path
        d="M20.0521 4.14792L17.6479 6.55208"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="miter"
      />
      <path d="M20.55 5.35L17.15 5.35" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="miter" />
      <path
        d="M20.0521 6.55208L17.6479 4.14792"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="miter"
      />
      <path
        d="M13.5461 9.30407C13.3968 9.00551 13.6207 7.8267 13.884 7.65119"
        stroke="currentColor"
        strokeWidth="1.15385"
        strokeLinecap="round"
        strokeLinejoin="miter"
      />
      <path
        d="M14.0505 7.54014C14.3139 7.01345 15.7091 8.29541 15.9015 8.39156"
        stroke="currentColor"
        strokeWidth="1.15385"
        strokeLinecap="round"
        strokeLinejoin="miter"
      />
      <path
        d="M16.1421 8.4656C16.6588 7.94889 16.5717 7.27762 16.1791 6.68871"
        stroke="currentColor"
        strokeWidth="1.15385"
        strokeLinecap="round"
        strokeLinejoin="miter"
      />
      <path
        d="M16.031 6.48511C15.5564 5.77322 17.9032 6.15685 18.067 6.13343"
        stroke="currentColor"
        strokeWidth="1.15385"
        strokeLinecap="round"
        strokeLinejoin="miter"
      />
      <path
        d="M9.66955 18.1596C10.4691 18.1802 11.2406 17.897 11.5982 17.6071C12.2233 17.1003 12.7236 16.6159 13.0752 15.6492"
        stroke="currentColor"
        strokeWidth="1.08597"
        strokeLinecap="round"
        strokeLinejoin="miter"
      />
      <path
        d="M13.4548 14.3032C13.4519 14.2974 13.4548 14.2857 13.4461 14.2857"
        stroke="currentColor"
        strokeWidth="1.08597"
        strokeLinecap="round"
        strokeLinejoin="miter"
      />
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
  // Traced 1:1 from the user's own redraw (made on iPad with Apple Pencil
  // in Linearity Curve) — path data unchanged, just stroke="#000000" ->
  // "currentColor" and camelCase attribute names for JSX.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M10.28 11.6339C9.08 10.8039 8.25 9.4539 8.25 7.8839C8.25 5.2539 10.58 3.0839 13.28 3.3839C15.23 3.6139 16.88 5.1839 17.18 7.2139C17.48 9.2439 16.43 10.9639 14.85 11.8639C16.8 12.4639 18.23 14.4139 17.93 16.6639C17.7 18.9939 15.6 20.6439 13.28 20.6439L8.25 20.6339C5.77 20.6339 3.75 19.1339 3 16.1339L3 10.1339L3.6 10.5839C5.18 11.7839 7.05 12.3839 9 12.3839L10.28 11.6339Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.65 10.1339C18 10.0539 19.28 9.4539 20.1 8.3339L21 7.1339L17.25 7.1339"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.7012 7.3004C14.6589 7.3004 14.6612 7.30499 14.7012 7.28498"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CatIcon({ size = 20, ...props }) {
  // Traced 1:1 from the user's own redraw (auto-vectorized on iPad in
  // Linearity Curve, starting from a PNG) — path data unchanged from the
  // source SVG's viewBox="0 0 75 75" / <g transform="translate(0,75)
  // scale(0.1,-0.1)"> pair, just fill="#000000" -> "currentColor". A
  // filled silhouette-of-the-stroke rather than an actual `stroke`, but
  // the traced line art reads identically to the rest of the set.
  return (
    <svg width={size} height={size} viewBox="0 0 75 75" fill="none" aria-hidden="true" {...props}>
      <g transform="translate(0,75) scale(0.1,-0.1)" fill="currentColor" stroke="none">
        <path d="M105 676 c-30 -30 -39 -78 -31 -164 3 -37 6 -71 7 -77 0 -5 -3 -36
-7 -68 -6 -47 -11 -60 -28 -67 -56 -21 -60 -77 -5 -66 36 7 48 -13 29 -49 -18
-34 -6 -59 25 -51 19 5 35 0 58 -18 61 -46 114 -61 222 -61 108 0 161 15 222
61 23 18 39 23 58 18 31 -8 43 17 25 51 -19 36 -7 56 29 49 55 -11 51 45 -5
66 -17 7 -22 20 -28 67 -4 32 -7 63 -7 68 1 6 4 40 7 77 8 86 -1 134 -31 164
-33 33 -80 31 -136 -4 -40 -25 -52 -28 -134 -27 -80 0 -95 4 -136 28 -57 34
-102 35 -134 3z m120 -63 c37 -25 48 -27 147 -28 103 -2 110 0 150 27 78 51
108 33 108 -65 0 -52 -1 -54 -25 -49 -35 6 -44 -22 -16 -52 20 -21 41 -74 41
-103 0 -6 -10 -13 -22 -15 -34 -5 -37 -45 -4 -58 32 -12 25 -38 -12 -42 -24
-3 -27 -7 -25 -36 1 -31 -3 -36 -45 -55 -67 -31 -227 -31 -294 0 -42 19 -46
24 -45 55 2 29 -1 33 -25 36 -37 4 -44 30 -12 42 33 13 30 53 -3 58 -13 2 -23
9 -23 15 0 29 21 82 41 103 28 30 19 58 -16 52 -24 -5 -25 -3 -25 49 0 97 31
116 105 66z" />
        <path d="M240 371 c-30 -57 17 -130 58 -89 16 16 16 80 0 96 -18 18 -46 14
-58 -7z" />
        <path d="M452 378 c-15 -15 -16 -63 -2 -89 24 -43 70 -12 70 48 0 32 -16 53
-40 53 -9 0 -21 -5 -28 -12z" />
        <path d="M335 260 c-21 -23 -14 -46 19 -62 20 -9 30 -8 51 6 29 19 32 38 9 60
-21 22 -57 20 -79 -4z" />
      </g>
    </svg>
  )
}

export function GhostIcon({ size = 20, ...props }) {
  // Traced 1:1 from the user's own redraw (auto-vectorized on iPad in
  // Linearity Curve, starting from a PNG) — replaces the octopus in the
  // picker, per the user's preference. Same convention as CatIcon above.
  return (
    <svg width={size} height={size} viewBox="0 0 75 75" fill="none" aria-hidden="true" {...props}>
      <g transform="translate(0,75) scale(0.1,-0.1)" fill="currentColor" stroke="none">
        <path d="M310 741 c-46 -15 -85 -39 -116 -73 -59 -62 -66 -86 -85 -323 -10
-121 -18 -241 -19 -267 0 -46 2 -48 37 -63 23 -10 48 -14 63 -10 31 8 63 8
111 0 23 -4 39 -3 43 4 9 14 53 14 62 0 4 -7 20 -8 43 -4 48 8 80 8 111 0 15
-4 40 0 63 10 35 15 37 17 37 63 -1 26 -9 146 -19 267 -19 237 -26 261 -85
323 -17 19 -49 43 -70 54 -43 22 -136 32 -176 19z m114 -42 c24 -6 60 -24 80
-41 64 -53 75 -86 91 -295 8 -104 17 -213 20 -244 5 -51 4 -57 -17 -66 -17 -8
-31 -6 -55 5 -30 14 -36 14 -69 -1 -32 -16 -37 -16 -57 -2 -27 19 -57 19 -84
0 -20 -14 -25 -14 -57 2 -33 15 -39 15 -69 1 -24 -11 -38 -13 -55 -5 -21 9
-22 15 -17 66 3 31 12 140 20 244 16 208 27 244 90 294 31 25 90 50 123 52 7
1 33 -4 56 -10z" />
        <path d="M227 502 c-25 -27 -22 -78 5 -96 46 -33 108 -4 108 49 0 55 -77 87
-113 47z m86 -14 c7 -21 -4 -38 -23 -38 -23 0 -34 16 -26 35 7 18 43 20 49 3z" />
        <path d="M430 500 c-58 -58 20 -142 88 -94 28 19 30 74 4 97 -25 23 -68 21
-92 -3z m88 -23 c4 -20 -25 -34 -40 -19 -15 15 -1 44 19 40 10 -2 19 -11 21
-21z" />
      </g>
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
  // Traced 1:1 from the user's own redraw (auto-vectorized on iPad in
  // Linearity Curve, starting from a PNG) — same convention as CatIcon.
  return (
    <svg width={size} height={size} viewBox="0 0 75 75" fill="none" aria-hidden="true" {...props}>
      <g transform="translate(0,75) scale(0.1,-0.1)" fill="currentColor" stroke="none">
        <path d="M326 652 c-9 -26 -80 -43 -105 -26 -22 15 -31 9 -31 -21 0 -27 -49
-75 -76 -75 -30 0 -35 -9 -19 -34 16 -25 9 -40 -22 -50 -19 -6 -23 -15 -23
-48 0 -31 4 -41 19 -45 18 -5 39 -63 31 -88 -12 -44 -12 -45 11 -45 29 0 79
-47 79 -75 0 -30 9 -36 31 -21 25 17 96 0 105 -26 7 -23 31 -23 38 0 8 25 78
43 101 26 22 -17 35 -9 35 20 0 28 49 76 78 76 23 0 28 15 13 39 -10 16 6 71
20 71 5 0 21 -7 34 -16 39 -26 48 -15 49 60 1 76 -9 88 -49 62 -13 -9 -29 -16
-34 -16 -15 0 -33 62 -21 74 17 17 11 36 -12 36 -29 0 -78 48 -78 76 0 29 -13
37 -35 20 -23 -17 -93 1 -101 26 -7 23 -31 23 -38 0z m82 -51 c23 -6 47 -9 52
-6 6 3 10 1 10 -5 0 -14 69 -80 84 -80 6 0 11 -15 12 -32 0 -18 4 -45 8 -60 8
-26 6 -28 -23 -28 -45 0 -123 20 -142 36 -25 22 -76 16 -189 -21 -128 -43
-145 -44 -145 -10 0 17 5 25 18 25 21 0 40 44 31 73 -4 11 -2 17 4 13 12 -7
82 60 82 80 0 8 5 12 11 9 11 -8 98 13 113 26 5 5 14 5 20 1 6 -5 30 -14 54
-21z m-11 -197 c3 -9 2 -33 -3 -53 -11 -43 -42 -53 -73 -22 -30 30 -26 44 9
39 20 -3 30 0 30 9 0 7 -11 13 -25 13 -14 0 -25 4 -25 9 0 24 78 28 87 5z
m261 2 c-10 -7 -18 -16 -18 -20 0 -3 8 -7 18 -7 16 -1 16 -2 0 -6 -10 -2 -18
-7 -18 -10 0 -3 8 -12 18 -19 14 -10 10 -10 -20 -1 -50 16 -53 48 -5 64 44 14
44 14 25 -1z m-383 -26 c-8 -25 20 -67 57 -86 27 -14 32 -14 54 0 13 9 26 29
30 44 3 15 7 32 9 38 2 7 27 6 80 -4 75 -15 76 -16 69 -41 -4 -14 -8 -41 -8
-58 -1 -19 -6 -33 -13 -33 -18 0 -83 -71 -76 -83 4 -7 0 -8 -11 -4 -18 7 -93
-10 -110 -24 -5 -5 -14 -5 -20 -1 -21 16 -94 32 -112 25 -11 -4 -15 -3 -11 4
7 12 -58 83 -76 83 -7 0 -12 12 -12 28 0 15 -4 39 -8 53 -6 25 -4 27 76 52 45
14 83 26 85 26 2 1 1 -8 -3 -19z" />
        <path d="M247 552 c-23 -26 -22 -28 18 -28 40 0 43 6 17 30 -18 15 -20 15 -35
-2z" />
        <path d="M382 558 c-19 -19 -14 -24 22 -25 32 -1 34 1 23 18 -14 22 -28 24
-45 7z" />
        <path d="M174 496 c-10 -26 4 -48 28 -44 33 4 33 52 0 56 -13 2 -25 -3 -28
-12z" />
        <path d="M320 490 c-11 -21 -11 -22 20 -22 11 0 22 0 25 1 9 2 -15 41 -25 41
-5 0 -14 -9 -20 -20z" />
        <path d="M467 462 c-19 -21 -11 -38 10 -21 10 9 17 8 28 -1 12 -10 15 -10 15
2 0 14 -19 38 -30 38 -4 0 -14 -8 -23 -18z" />
        <path d="M190 307 c0 -8 7 -20 15 -27 13 -10 19 -10 35 5 22 20 16 43 -6 24
-11 -9 -17 -9 -29 1 -12 10 -15 10 -15 -3z" />
        <path d="M470 302 c0 -5 6 -17 14 -28 15 -19 15 -19 37 3 24 24 20 44 -5 24
-10 -8 -16 -9 -21 -1z" />
        <path d="M270 222 c0 -5 8 -16 18 -26 18 -15 20 -15 37 4 20 23 13 39 -9 21
-10 -8 -16 -9 -21 -1z" />
        <path d="M400 221 c0 -5 9 -16 21 -27 20 -18 21 -18 35 1 20 27 18 31 -21 32
-19 1 -35 -2 -35 -6z" />
      </g>
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
  // Traced 1:1 from the user's own redraw (auto-vectorized on iPad in
  // Linearity Curve, starting from a PNG) — same convention as CatIcon.
  return (
    <svg width={size} height={size} viewBox="0 0 75 75" fill="none" aria-hidden="true" {...props}>
      <g transform="translate(0,75) scale(0.1,-0.1)" fill="currentColor" stroke="none">
        <path d="M292 685 c-32 -14 -33 -15 -18 -43 15 -28 15 -29 -40 -68 -53 -38
-91 -81 -80 -91 2 -3 18 10 35 29 16 19 53 47 82 62 l52 29 -41 -42 c-43 -44
-71 -106 -55 -122 12 -12 100 -28 124 -22 31 9 22 18 -18 19 -21 0 -51 3 -66
7 -23 6 -27 11 -21 30 27 91 174 171 254 138 23 -9 23 -10 4 -10 -28 -1 -164
-69 -164 -83 0 -5 3 -8 8 -6 4 2 36 17 72 34 82 40 120 49 120 31 0 -22 -76
-103 -110 -117 -31 -13 -40 -30 -17 -30 38 0 124 85 147 144 20 52 76 22 68
-36 -3 -18 1 -52 10 -76 21 -64 11 -148 -26 -217 -36 -66 -25 -85 13 -21 39
67 52 143 36 213 -7 32 -13 79 -12 105 2 38 -2 49 -21 62 -12 9 -31 16 -41 16
-10 0 -33 11 -51 25 -71 54 -172 71 -244 40z m186 -25 c23 -10 42 -21 42 -22
0 -2 -28 -4 -62 -3 -35 0 -84 -4 -109 -8 -40 -7 -48 -5 -53 10 -5 11 -1 22 10
30 27 19 122 16 172 -7z" />
        <path d="M105 418 c-24 -61 -29 -128 -15 -189 8 -30 12 -73 11 -96 -3 -52 23
-72 89 -72 25 0 82 -3 127 -7 75 -6 87 -4 140 21 56 25 113 70 113 88 0 5 -17
-5 -37 -21 -74 -58 -101 -66 -198 -65 -218 3 -222 4 -212 65 2 18 -2 50 -9 72
-23 64 -16 140 21 229 4 9 3 17 -3 17 -5 0 -17 -19 -27 -42z" />
        <path d="M561 446 c-8 -9 -11 -19 -7 -23 9 -9 29 13 24 27 -2 8 -8 7 -17 -4z" />
        <path d="M522 368 c-19 -19 -14 -30 8 -18 11 6 20 15 20 20 0 14 -14 12 -28
-2z" />
        <path d="M582 349 c-10 -15 -10 -19 2 -19 15 0 29 27 18 34 -5 3 -13 -4 -20
-15z" />
        <path d="M439 334 c-12 -14 -11 -16 5 -13 11 2 21 10 24 17 5 17 -13 15 -29
-4z" />
        <path d="M525 290 c-17 -18 -17 -20 -1 -20 9 0 19 7 23 15 9 25 -2 27 -22 5z" />
      </g>
    </svg>
  )
}

export function FireIcon({ size = 20, ...props }) {
  // Back to the very first version — preferred over the two later
  // reworks (a single un-pinched loop, then that plus an inner curl).
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 2.8c1.6 2.4.9 4.3-.4 6c-1.6 2.1-3 3.6-3 5.7a3.4 3.4 0 006.8 0c0-1-.4-1.7-.8-2.4c.9.5 1.7 1.6 1.7 3.1a5.2 5.2 0 01-10.4 0c0-3.7 2.5-5.4 4.1-7.7c1-1.4 1.6-2.8 2-4.7z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
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
  { id: 'ghost', label: 'Ghost', Icon: GhostIcon },
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
