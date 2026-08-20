// Shared by GroupStats and AccountStats — both compare a current-period
// amount against the previous equivalent period via comparePeriods()
// (src/lib/periodComparison.js) and render the result identically.
//
// Spending less than the previous equivalent period reads as the "good"
// direction (accent color), spending more as the "worth noticing" one
// (warn color) — the inverse of how the same two color classes are used
// for balances elsewhere, since "more spending" and "being owed money"
// aren't the same kind of good.
export default function ComparisonBadge({ comparison }) {
  const { changePercent, current, previous } = comparison
  if (previous === 0 && current === 0) return null

  if (changePercent === null) {
    return <span className="comparison-badge muted">new vs last period</span>
  }
  if (changePercent === 0) {
    return <span className="comparison-badge muted">same as last period</span>
  }

  const isIncrease = changePercent > 0
  return (
    <span className={`comparison-badge ${isIncrease ? 'balance-negative' : 'balance-positive'}`}>
      {isIncrease ? '▲' : '▼'} {Math.abs(changePercent)}% vs last period
    </span>
  )
}
