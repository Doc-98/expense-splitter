import { useState } from 'react'

// A donut built from stacked stroke-dasharray segments on one circle, not
// individually computed <path> arcs — no large-arc-flag edge cases to get
// wrong, and it's the standard trick for exactly this shape. Hand-rolled
// SVG rather than a charting library, same reasoning as LineChart.jsx.
const SIZE = 200
const CENTER = SIZE / 2
const RADIUS = 70
const STROKE = 30
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

// `slices` is `[{ key, name, color, amount }]` — GroupGraphs/AccountGraphs
// build this from computeCategoryTotals()/computeMyCategorySpend() over
// whatever period the page's own selector currently has active, in the
// same "id or name, whichever this page's own data uses" key convention
// as buildSeries()'s categoryKey (see timeSeries.js). `onSelectCategory`
// is optional — when given, clicking a slice or its legend row calls it
// with that slice's key, letting a page sync its line chart's own
// category filter to whatever the pie was just clicked on; omit it for a
// purely read-only chart.
export default function PieChart({ slices, format, onSelectCategory }) {
  const [hoveredKey, setHoveredKey] = useState(null)
  const total = slices.reduce((sum, s) => sum + s.amount, 0)

  if (total <= 0) {
    return (
      <div className="pie-chart-wrap pie-chart-empty">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="pie-chart" role="img" aria-label="No spending in this period">
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="var(--border)" strokeWidth={STROKE} />
        </svg>
        <p className="muted pie-chart-empty-label">No spending in this period</p>
      </div>
    )
  }

  const sorted = [...slices].filter((s) => s.amount > 0).sort((a, b) => b.amount - a.amount)

  let cumulative = 0
  const arcs = sorted.map((s) => {
    const length = (s.amount / total) * CIRCUMFERENCE
    const arc = { ...s, length, offset: cumulative, percent: (s.amount / total) * 100 }
    cumulative += length
    return arc
  })

  return (
    <div className="pie-chart-wrap">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="pie-chart" role="img" aria-label="Spending by category">
        {/* Rotated so the first slice starts at 12 o'clock instead of the
            default 3 o'clock a plain stroke-dasharray circle starts at. */}
        <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
          {arcs.map((arc) => (
            <circle
              key={arc.key}
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke={arc.color}
              strokeWidth={hoveredKey === arc.key ? STROKE + 6 : STROKE}
              strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
              strokeDashoffset={-arc.offset}
              className="pie-chart-slice"
              onMouseEnter={() => setHoveredKey(arc.key)}
              onMouseLeave={() => setHoveredKey((cur) => (cur === arc.key ? null : cur))}
              onClick={() => onSelectCategory?.(arc.key)}
              role={onSelectCategory ? 'button' : undefined}
              tabIndex={onSelectCategory ? 0 : undefined}
              aria-label={`${arc.name}: ${format(arc.amount)} (${Math.round(arc.percent)}%)`}
            />
          ))}
        </g>
        <text x={CENTER} y={CENTER - 4} textAnchor="middle" className="pie-chart-total-amount mono">
          {format(total)}
        </text>
        <text x={CENTER} y={CENTER + 14} textAnchor="middle" className="pie-chart-total-label muted">
          Total
        </text>
      </svg>

      <ul className="pie-chart-legend">
        {arcs.map((arc) => (
          <li
            key={arc.key}
            className={`pie-chart-legend-item ${hoveredKey === arc.key ? 'active' : ''}`}
            onMouseEnter={() => setHoveredKey(arc.key)}
            onMouseLeave={() => setHoveredKey((cur) => (cur === arc.key ? null : cur))}
          >
            <button
              type="button"
              className="pie-chart-legend-btn"
              onClick={() => onSelectCategory?.(arc.key)}
              disabled={!onSelectCategory}
            >
              <span className="category-dot" style={{ background: arc.color }} />
              <span className="pie-chart-legend-name">{arc.name}</span>
              <span className="mono pie-chart-legend-amount">{format(arc.amount)}</span>
              <span className="muted pie-chart-legend-percent">{Math.round(arc.percent)}%</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
