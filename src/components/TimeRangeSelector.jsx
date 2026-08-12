const GRANULARITIES = ['week', 'month', 'year', 'all']

export default function TimeRangeSelector({ granularity, setGranularity, offset, setOffset, label }) {
  function changeGranularity(g) {
    setGranularity(g)
    setOffset(0)
  }

  return (
    <div className="time-range">
      <div className="tab-row time-range-tabs">
        {GRANULARITIES.map((g) => (
          <button
            key={g}
            type="button"
            className={granularity === g ? 'tab active' : 'tab'}
            onClick={() => changeGranularity(g)}
          >
            {g === 'all' ? 'All time' : g.charAt(0).toUpperCase() + g.slice(1)}
          </button>
        ))}
      </div>
      {granularity !== 'all' && (
        <div className="time-range-nav">
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
        </div>
      )}
    </div>
  )
}
