// JS's Number("3,50") is NaN — plain Number() only understands a period as
// the decimal separator. Many people (especially outside the US) type prices
// with a comma instead, so every manually-typed amount in this app should
// go through this first.
export function parseNumber(value) {
  if (value == null) return NaN
  const normalized = String(value).trim().replace(',', '.')
  return Number(normalized)
}
