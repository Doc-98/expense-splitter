import { useId, useState } from 'react'

// Fixed logical coordinate space — scaled to whatever width the caller's
// layout gives it via `width: 100%` in CSS, same responsive-SVG trick used
// everywhere else an SVG needs to fill a flexible container.
const VIEW_W = 600
const VIEW_H = 220
const MARGIN = { top: 24, right: 10, bottom: 26, left: 10 }
const PLOT_W = VIEW_W - MARGIN.left - MARGIN.right
const PLOT_H = VIEW_H - MARGIN.top - MARGIN.bottom
// Caps how many x-axis labels actually render — one per point would be
// unreadable at ~30 daily points crammed into 600 logical units wide.
const MAX_LABELS = 7

// Turns straight point-to-point segments into a smooth curve through every
// point — a Catmull-Rom spline, converted to the cubic Beziers SVG paths
// actually use (the standard way to draw one: each segment's two control
// points come from its neighbors on either side, clamped to the curve's
// own edges at the first/last point since there's no "point before the
// start"/"point after the end" to lean on there). 1/8 is a gentle enough
// tension that the curve won't visibly overshoot below zero at a sharp dip
// between two tall points, while still reading as a real curve rather than
// barely-rounded corners.
function smoothPath(pts) {
  if (pts.length < 2) return ''
  const seg = [`M${pts[0][0]},${pts[0][1]}`]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 8
    const c1y = p1[1] + (p2[1] - p0[1]) / 8
    const c2x = p2[0] - (p3[0] - p1[0]) / 8
    const c2y = p2[1] - (p3[1] - p1[1]) / 8
    seg.push(`C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`)
  }
  return seg.join(' ')
}

// A deliberately minimal line chart — no numeric y-axis (its only tick is
// the max value, labeled directly above the highest point, since the
// baseline at zero is already visually obvious) — hand-rolled SVG rather
// than a charting library, same "no new UI dependency" choice as every
// other visual in this app (see .stats-bars, the plain-CSS bar chart
// Your Stats/Group Stats already use). `points` is whatever buildSeries()
// (src/lib/timeSeries.js) returns: `[{ key, label, amount }]`, already
// zero-filled for every day/month in range, already in x-axis order.
export default function LineChart({ points, format, color = 'var(--accent)' }) {
  const [activeIndex, setActiveIndex] = useState(null)
  const gradientId = useId()

  if (points.length === 0) return null

  // The real highest point, for the label — kept separate from the divide-
  // by-zero guard below, so an all-zero period honestly shows "€0.00" at
  // the top rather than a phantom "€1.00" that never actually happened.
  const realMax = Math.max(0, ...points.map((p) => p.amount))
  const maxAmount = Math.max(1, realMax)
  const x = (i) => (points.length === 1 ? MARGIN.left + PLOT_W / 2 : MARGIN.left + (i / (points.length - 1)) * PLOT_W)
  const y = (amount) => MARGIN.top + PLOT_H - (amount / maxAmount) * PLOT_H
  const baselineY = MARGIN.top + PLOT_H

  const coords = points.map((p, i) => [x(i), y(p.amount)])
  const linePath = points.length === 1 ? '' : smoothPath(coords)
  const areaPath = linePath ? `${linePath} L${x(points.length - 1)},${baselineY} L${x(0)},${baselineY} Z` : ''

  // Always show the first and last label (the range's own edges), plus
  // roughly MAX_LABELS - 2 more spread evenly between them — skipping
  // labels rather than shrinking or rotating text to fit.
  const labelStep = Math.max(1, Math.ceil(points.length / MAX_LABELS))
  const showLabel = (i) => i === 0 || i === points.length - 1 || i % labelStep === 0

  const active = activeIndex !== null ? points[activeIndex] : null
  // Clamps the tooltip's own x so it never renders past the chart's edges
  // for a point right at the start or end of the line.
  const tooltipX = active ? Math.min(Math.max(x(activeIndex), MARGIN.left + 40), VIEW_W - MARGIN.right - 40) : 0

  return (
    <div className="line-chart-wrap">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="line-chart" role="img" aria-label="Spending over time">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        <text x={MARGIN.left} y={MARGIN.top - 8} className="line-chart-max-label">
          {format(realMax)}
        </text>

        <line x1={MARGIN.left} y1={baselineY} x2={VIEW_W - MARGIN.right} y2={baselineY} className="line-chart-baseline" />

        <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) => (
          <g key={p.key}>
            {showLabel(i) && (
              <text x={x(i)} y={VIEW_H - 6} className="line-chart-x-label" textAnchor="middle">
                {p.label}
              </text>
            )}
            <circle cx={x(i)} cy={y(p.amount)} r={activeIndex === i ? 4 : 2.5} fill={color} />
            {/* Larger invisible target — the visible dot above is too small
                to comfortably hover or tap on its own, especially on a
                phone screen. */}
            <circle
              cx={x(i)}
              cy={y(p.amount)}
              r={10}
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-label={`${p.label}: ${format(p.amount)}`}
              onMouseEnter={() => setActiveIndex(i)}
              onFocus={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex((cur) => (cur === i ? null : cur))}
              onBlur={() => setActiveIndex((cur) => (cur === i ? null : cur))}
            />
          </g>
        ))}

        {active && (
          <g transform={`translate(${tooltipX}, ${Math.max(y(active.amount) - 34, 2)})`} className="line-chart-tooltip">
            <rect x={-38} y={-16} width={76} height={32} rx={6} />
            <text y={-4} textAnchor="middle" className="line-chart-tooltip-label">
              {active.label}
            </text>
            <text y={10} textAnchor="middle" className="line-chart-tooltip-amount mono">
              {format(active.amount)}
            </text>
          </g>
        )}
      </svg>
    </div>
  )
}
