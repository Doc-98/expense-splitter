import { useEffect } from 'react'
import { isTypingTarget } from '../lib/isTypingTarget'

// A separate, simpler control from TimeRangeSelector.jsx — that one covers
// week/month/year/all as single *periods* to inspect one at a time; the
// spending-graphs page needs a *span of points to plot*, and "a week" isn't
// a useful span (7 points is either 7 near-identical daily dots or, rolled
// up to weeks, a single one) — hence three tabs instead of four, and no
// jump tiers (nothing here is ever more than 12 steps from where you are).
export const GRAPH_TABS = [
  { id: 'month', label: 'This month' },
  { id: 'quad', label: 'Last 4 months' },
  { id: 'year', label: 'This year' },
]

export default function GraphsPeriodSelector({ tab, setTab, offset, setOffset, label }) {
  function changeTab(id) {
    setTab(id)
    setOffset(0)
  }

  // Same ←/→ convention as TimeRangeSelector — steps to the previous/next
  // span, disabled once you're back at the current one (offset 0), same
  // isTypingTarget guard so it never hijacks a keystroke meant for a form
  // field elsewhere on the page.
  useEffect(() => {
    function onKeyDown(e) {
      if (isTypingTarget(document.activeElement)) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setOffset((o) => o - 1)
      } else if (e.key === 'ArrowRight') {
        if (offset >= 0) return
        e.preventDefault()
        setOffset((o) => Math.min(0, o + 1))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [offset, setOffset])

  return (
    <div className="time-range">
      <div className="tab-row time-range-tabs">
        {GRAPH_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => changeTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="time-range-nav">
        <button type="button" className="btn-icon" onClick={() => setOffset((o) => o - 1)} aria-label="Previous period">
          ‹
        </button>
        <span className="time-range-label-stack">
          <span className="time-range-label">{label}</span>
        </span>
        <button
          type="button"
          className="btn-icon"
          onClick={() => setOffset((o) => Math.min(0, o + 1))}
          disabled={offset >= 0}
          aria-label="Next period"
        >
          ›
        </button>
      </div>
    </div>
  )
}
