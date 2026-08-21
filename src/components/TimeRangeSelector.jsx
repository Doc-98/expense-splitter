const GRANULARITIES = ['week', 'month', 'year', 'all']

// How far a "jump ~1 year" click moves the offset, per granularity — not
// present for 'year' itself, since a single ordinary step there is already
// a full year; doubling that isn't solving the same problem a 104-click
// walk through weekly offsets is.
const BIG_STEP = { week: 52, month: 12 }
const BIG_STEP_LABEL = { week: '52 weeks', month: '12 months' }

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

  const bigStep = BIG_STEP[granularity]

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
          {bigStep && (
            <button
              type="button"
              className="btn-icon"
              onClick={() => setOffset((o) => o - bigStep)}
              aria-label={`Jump back ${BIG_STEP_LABEL[granularity]}`}
            >
              ‹‹
            </button>
          )}
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
          {bigStep && (
            <button
              type="button"
              className="btn-icon"
              onClick={() => setOffset((o) => Math.min(0, o + bigStep))}
              disabled={offset >= 0}
              aria-label={`Jump forward ${BIG_STEP_LABEL[granularity]}`}
            >
              ››
            </button>
          )}
        </div>
      )}
    </div>
  )
}
