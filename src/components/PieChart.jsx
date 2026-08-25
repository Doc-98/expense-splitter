import { useState } from 'react'

const SIZE = 200
const CENTER = SIZE / 2
const RADIUS = 70
const STROKE = 30
const OUTER_R = RADIUS + STROKE / 2
const INNER_R = RADIUS - STROKE / 2

function polarPoint(angleDeg, r) {
  // angleDeg measured clockwise from 12 o'clock, matching how everyone
  // reads a pie/donut chart — plain trigonometry would start at 3
  // o'clock, hence the -90 shift.
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad) }
}

// A filled donut-wedge path (outer arc, in along the inner radius, inner
// arc back, close) rather than a stroked arc or a stroke-dasharray segment
// on a plain circle — a *filled* closed shape has no stroke caps to go
// wrong, so unlike either of those it stays geometrically correct no
// matter how thin the wedge is. (An earlier version used stroke-dasharray
// on one shared circle: fine for ordinary slices, but a slice thinner than
// the stroke itself — a 1% category is only ~4 logical units of a 30-unit
// stroke — has its dash segment's own flat end-caps cross over each other,
// rendering as a self-intersecting bowtie instead of a small clean wedge.
// That's the actual shape a person would see, not a one-off glitch.)
//
// endAngle is clamped just under a full 360° turn — an SVG arc command's
// start and end point coinciding exactly (a lone category at 100%) is a
// degenerate case most renderers draw as nothing at all, and the sliver
// this leaves out is far below anything visible.
function donutWedgePath(startAngle, endAngle) {
  const clampedEnd = Math.min(endAngle, startAngle + 359.99)
  const largeArc = clampedEnd - startAngle > 180 ? 1 : 0
  const outerStart = polarPoint(startAngle, OUTER_R)
  const outerEnd = polarPoint(clampedEnd, OUTER_R)
  const innerEnd = polarPoint(clampedEnd, INNER_R)
  const innerStart = polarPoint(startAngle, INNER_R)
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${OUTER_R} ${OUTER_R} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${INNER_R} ${INNER_R} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ')
}

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

  let cumulativeAngle = 0
  const arcs = sorted.map((s) => {
    const sweep = (s.amount / total) * 360
    const arc = { ...s, startAngle: cumulativeAngle, endAngle: cumulativeAngle + sweep, percent: (s.amount / total) * 100 }
    cumulativeAngle += sweep
    return arc
  })

  return (
    <div className="pie-chart-wrap">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="pie-chart" role="img" aria-label="Spending by category">
        {arcs.map((arc) => (
          <path
            key={arc.key}
            d={donutWedgePath(arc.startAngle, arc.endAngle)}
            fill={arc.color}
            className={`pie-chart-slice ${hoveredKey === arc.key ? 'active' : ''}`}
            onMouseEnter={() => setHoveredKey(arc.key)}
            onMouseLeave={() => setHoveredKey((cur) => (cur === arc.key ? null : cur))}
            onClick={() => onSelectCategory?.(arc.key)}
            role={onSelectCategory ? 'button' : undefined}
            tabIndex={onSelectCategory ? 0 : undefined}
            aria-label={`${arc.name}: ${format(arc.amount)} (${Math.round(arc.percent)}%)`}
          />
        ))}
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
