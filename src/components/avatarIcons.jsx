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
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M17.8 5.7c3.4 1.9 4.1 7.2 1 10.6c-2.8 3.1-7.4 3.9-10.9 1.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="17.8" cy="5.7" r="1" fill="currentColor" />
      <path d="M17.8 5.7l1.9-2.2M17.8 5.7l2.7-.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M18.3 8.9l1.7.7M16.3 12.7l1.9.9M12.9 16.1l1.5 1.4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M7.9 18.1c-1 .8-2.3 1.1-3.5.9M7.9 18.1c-.1-1.3-.7-2.4-1.7-3.1M7.9 18.1c-1.1.4-2.3.2-3.2-.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function DuckIcon({ size = 20, ...props }) {
  // Front-on chick/duckling face, same recipe as CatIcon just below (one
  // head silhouette plus a couple of features) rather than a body+head
  // pair — two unfilled overlapping circles read as a figure-eight, not
  // a duck, at avatar size, so this stays a single closed silhouette.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="13" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8.3 14.2c0 1.3 1.6 2.2 3.7 2.2s3.7-.9 3.7-2.2c0-.9-1.6-1.4-3.7-1.4s-3.7.5-3.7 1.4z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8.3 14.2h7.4" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="9.7" cy="11.2" r="0.85" fill="currentColor" />
      <circle cx="14.3" cy="11.2" r="0.85" fill="currentColor" />
      <path
        d="M10.7 6.6c-.4-1.3.2-2.4 1.2-2.9M13.3 6.6c.4-1.3-.2-2.4-1.2-2.9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function CatIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M7 8.6L5.6 4.2l3.7 3" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M17 8.6l1.4-4.4l-3.7 3" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="13.4" r="6.1" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9.6" cy="12.7" r="0.85" fill="currentColor" />
      <circle cx="14.4" cy="12.7" r="0.85" fill="currentColor" />
      <path d="M11.2 15.4h1.6l-.8 1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M4.7 14.8h3.1M4.9 16.4l2.9-.6M16.2 14.8h3.1M16.2 15.8l2.9.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function TurtleIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M4.5 14a7.5 5.6 0 0115 0" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M3.2 14c0 2.9 3.9 5.3 8.8 5.3s8.8-2.4 8.8-5.3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M9 14v3.3M12 14.2v3.6M15 14v3.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="20.3" cy="12.6" r="1.9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2.7 13.6l-1.7-.6l.6 1.9z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path
        d="M5 17.7c-.9.5-1.6 1.3-1.9 2.3M19 17.7c.9.5 1.6 1.3 1.9 2.3"
        stroke="currentColor"
        strokeWidth="1.5"
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
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M5 13.2a7 7 0 0114 0v.5H5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="9.3" cy="10.4" r="0.9" fill="currentColor" />
      <circle cx="14.7" cy="10.4" r="0.9" fill="currentColor" />
      <path
        d="M5.6 13.7c.5 1.7-.6 2.9.3 4.7M8.6 13.7c.3 1.9-.9 3.1.4 4.9M12 13.7v5.6M15.4 13.7c-.3 1.9.9 3.1-.4 4.9M18.4 13.7c-.5 1.7.6 2.9-.3 4.7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
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
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="10.2" cy="12.6" r="4.4" stroke="currentColor" strokeWidth="1.8" />
      {[0, 36, 72, 108, 144, 180, 216, 252, 288, 324].map((deg) => (
        <line
          key={deg}
          x1="10.2"
          y1="8.2"
          x2="10.2"
          y2="5.4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          transform={`rotate(${deg} 10.2 12.6)`}
        />
      ))}
      <circle cx="8.6" cy="11" r="0.85" fill="currentColor" />
      <path d="M8.1 14.4c.8.7 1.9.8 2.7.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M15.4 11l3.6-2.2l-.5 4.3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

export function FlowerIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      {[0, 72, 144, 216, 288].map((deg) => (
        <path
          key={deg}
          d="M12 9.4c-1.7-2.3-1.3-4.9 0-5.9c1.3 1 1.7 3.6 0 5.9z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
          transform={`rotate(${deg} 12 12)`}
        />
      ))}
      <circle cx="12" cy="12" r="2.1" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

export function LemonIcon({ size = 20, ...props }) {
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
      <path
        d="M17.4 5.8c.6-1 1.8-1.5 2.9-1.2c-.2 1.1-1.1 2-2.2 2.2z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M6.6 19.4c-.7.6-1.6.8-2.4.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="10.2" cy="10.5" r="0.55" fill="currentColor" />
      <circle cx="13.6" cy="12.9" r="0.55" fill="currentColor" />
      <circle cx="10.8" cy="15.3" r="0.55" fill="currentColor" />
    </svg>
  )
}

export function FireIcon({ size = 20, ...props }) {
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
