import { useEffect, useState } from 'react'

// Loading placeholders: a pale outline of the content about to appear,
// instead of a bare "Loading…" line. Each is sized like the real thing
// (a skeleton row is exactly a .card-list-item's height) so nothing jumps
// when the data lands.
//
// The shapes only show after a short delay (LOADING_DELAY_MS): a load
// that finishes quickly shouldn't flash a placeholder, and revisits
// usually paint straight from a cache anyway. The label is there from the
// first frame, though, for screen readers (role="status") and tests.

const LOADING_DELAY_MS = 300

function useDelayedVisible(delay = LOADING_DELAY_MS) {
  const [visible, setVisible] = useState(delay <= 0)
  useEffect(() => {
    if (delay <= 0) return
    const t = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(t)
  }, [delay])
  return visible
}

// One placeholder shape. Width/height come in through style so each use
// can mimic the text it stands in for.
export function Skeleton({ className = '', style }) {
  return <span className={`skeleton ${className}`} style={style} />
}

// The wrapper every loading state uses: announces `label`, then after the
// delay shows `children` (the shapes, hidden from assistive tech).
export function LoadingState({ label, children, delay = LOADING_DELAY_MS, className = '' }) {
  const visible = useDelayedVisible(delay)
  return (
    <div className={`loading-state ${className}`} role="status" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      {visible && <div aria-hidden="true">{children}</div>}
    </div>
  )
}

// Title/note widths cycle through these so a list of placeholders doesn't
// look like one shape stamped out N times.
const TITLE_WIDTHS = ['58%', '42%', '66%', '36%', '52%']
const NOTE_WIDTHS = ['36%', '28%', '40%', '24%', '32%']

// Placeholder .card-list-item rows: a title, and optionally a note under
// it and an amount on the right (bill rows).
export function SkeletonRows({ count = 3, withNote = false, withAmount = false }) {
  return (
    <div className="skeleton-rows">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton-row-main">
            <Skeleton className="skeleton-title" style={{ width: TITLE_WIDTHS[i % TITLE_WIDTHS.length] }} />
            {withNote && <Skeleton className="skeleton-line" style={{ width: NOTE_WIDTHS[i % NOTE_WIDTHS.length] }} />}
          </div>
          {withAmount && <Skeleton className="skeleton-amount" />}
        </div>
      ))}
    </div>
  )
}

// A few plain text lines, for sections that load a short list or a form.
export function SkeletonLines({ count = 3 }) {
  return (
    <div className="skeleton-lines">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="skeleton-line" style={{ width: ['72%', '58%', '64%', '46%'][i % 4] }} />
      ))}
    </div>
  )
}

// A whole page still downloading its code (App.jsx's Suspense fallback):
// a title and a list.
export function PageSkeleton({ label = 'Loading…' }) {
  return (
    <div className="page">
      <LoadingState label={label}>
        <Skeleton className="skeleton-page-title" />
        <SkeletonRows count={4} withNote />
      </LoadingState>
    </div>
  )
}

// Stats pages: the summary tiles and a few bars.
export function StatsSkeleton({ label = 'Loading stats…', tiles = 3 }) {
  return (
    <LoadingState label={label}>
      <div className="stats-summary">
        {Array.from({ length: tiles }, (_, i) => (
          <div key={i} className="stats-summary-item skeleton-tile">
            <Skeleton className="skeleton-tile-value" />
            <Skeleton className="skeleton-line" style={{ width: '50%' }} />
          </div>
        ))}
      </div>
      <div className="skeleton-bars">
        {['85%', '60%', '38%', '20%'].map((w, i) => (
          <div key={i} className="skeleton-bar-row">
            <Skeleton className="skeleton-line skeleton-bar-label" />
            <Skeleton className="skeleton-bar" style={{ maxWidth: w }} />
            <Skeleton className="skeleton-line skeleton-bar-value" />
          </div>
        ))}
      </div>
    </LoadingState>
  )
}

// Graph pages: one chart-sized block and a legend line or two.
export function ChartSkeleton({ label = 'Loading graphs…' }) {
  return (
    <LoadingState label={label}>
      <Skeleton className="skeleton-chart" />
      <SkeletonLines count={2} />
    </LoadingState>
  )
}
