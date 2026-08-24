// Divides `amount` into `n` currency amounts (rounded to cents) that sum
// back to exactly the rounded `amount` instead of drifting off by a cent
// once each share is rounded independently — e.g. $10 / 3 = $3.33 × 3 =
// $9.99, a cent short. Whole cents beyond the even split go to the first
// share(s) rather than anywhere fancier: an equal split is exactly the
// case where it genuinely doesn't matter who ends up with the extra cent.
export function splitEvenly(amount, n) {
  if (n <= 0) return []
  const totalCents = Math.round(amount * 100)
  const base = Math.floor(totalCents / n)
  const remainder = totalCents - base * n
  return Array.from({ length: n }, (_, i) => (base + (i < remainder ? 1 : 0)) / 100)
}
