// A percentage change from a previous total of (essentially) zero isn't
// meaningful — there's no useful way to express "infinite percent
// increase" — so changePercent is null in that case, and callers should
// show something else (the raw amount, or "new") instead of a percentage.
export function comparePeriods(current, previous) {
  const changeAmount = Math.round((current - previous) * 100) / 100
  const changePercent = previous > 0.005 ? Math.round((changeAmount / previous) * 1000) / 10 : null
  return { current, previous, changeAmount, changePercent }
}
