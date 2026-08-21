const GRANULARITIES = ['week', 'month', 'year', 'all']

// Extra jump tiers beyond the ordinary single ‹ / › step, smallest first.
// Month view gets one (a full year, 12 months). Week view gets two — a
// year alone still leaves up to ~25 single-step clicks to fine-tune to a
// specific week within it, so a ~1 month (4 week) tier sits between the
// single step and the year jump. No entry for 'year' itself: an ordinary
// step there is already a full year, so a bigger tier wouldn't solve the
// same problem a 104-click walk through weekly offsets does.
const JUMP_TIERS = {
  week: [
    { amount: 4, unitLabel: '1 month' },
    { amount: 52, unitLabel: '1 year' },
  ],
  month: [{ amount: 12, unitLabel: '1 year' }],
}

function granularityLabel(g) {
  return g === 'all' ? 'All time' : g.charAt(0).toUpperCase() + g.slice(1)
}

// defaultGranularity/onSetDefault are both optional — omit them (as
// GroupStats.jsx does) and this renders exactly as it always has, with no
// outline and no "Set as default" link. Only Your Stats passes them, since
// "default period on load" is a Your-Stats-specific preference (see
// src/lib/statsPreferences.js).
export default function TimeRangeSelector({
  granularity,
  setGranularity,
  offset,
  setOffset,
  label,
  defaultGranularity,
  onSetDefault,
}) {
  function changeGranularity(g) {
    setGranularity(g)
    setOffset(0)
  }

  const tiers = JUMP_TIERS[granularity] || []
  // Chevron count grows with distance from the single ‹ / › — 2 for the
  // smallest extra tier, 3 for the next, and so on (there are never more
  // than two today, but this generalizes if a third ever gets added).
  // Rendered left-to-right, the *biggest* jump sits furthest from the
  // label on the left (reversed order); on the right, ascending order puts
  // the biggest jump furthest away there too — the usual
  // first/prev/next/last shape.
  const leftSteps = [...tiers].reverse().map((t, i) => ({ ...t, chevrons: tiers.length - i + 1 }))
  const rightSteps = tiers.map((t, i) => ({ ...t, chevrons: i + 2 }))

  return (
    <div className="time-range">
      <div className="tab-row time-range-tabs">
        {GRANULARITIES.map((g) => (
          <button
            key={g}
            type="button"
            className={['tab', granularity === g && 'active', defaultGranularity === g && 'tab-is-default']
              .filter(Boolean)
              .join(' ')}
            onClick={() => changeGranularity(g)}
          >
            {granularityLabel(g)}
          </button>
        ))}
      </div>
      {onSetDefault && defaultGranularity && defaultGranularity !== granularity && (
        <button
          type="button"
          className="btn-link time-range-set-default"
          onClick={() => onSetDefault(granularity)}
        >
          Set {granularityLabel(granularity)} as default
        </button>
      )}
      {granularity !== 'all' && (
        <div className="time-range-nav">
          {leftSteps.map((t) => (
            <button
              key={`back-${t.amount}`}
              type="button"
              className="btn-icon time-range-jump"
              onClick={() => setOffset((o) => o - t.amount)}
              aria-label={`Jump back ${t.unitLabel}`}
            >
              {'‹'.repeat(t.chevrons)}
            </button>
          ))}
          <button
            type="button"
            className="btn-icon"
            onClick={() => setOffset((o) => o - 1)}
            aria-label="Previous period"
          >
            ‹
          </button>
          <span className="time-range-label">{label}</span>
          <button
            type="button"
            className="btn-icon"
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={offset >= 0}
            aria-label="Next period"
          >
            ›
          </button>
          {rightSteps.map((t) => (
            <button
              key={`fwd-${t.amount}`}
              type="button"
              className="btn-icon time-range-jump"
              onClick={() => setOffset((o) => Math.min(0, o + t.amount))}
              disabled={offset >= 0}
              aria-label={`Jump forward ${t.unitLabel}`}
            >
              {'›'.repeat(t.chevrons)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
