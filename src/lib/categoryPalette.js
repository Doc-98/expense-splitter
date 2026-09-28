// A small preset palette rather than a full color picker — keeps adding a
// category a one-tap affair instead of a whole UI of its own. One swatch
// per default category, in the same order (the "slot"), plus a custom
// colour input. These hexes are what gets *saved*; what's *shown* goes
// through categoryColor() below, so each slot can look different per
// theme and in the colour-blind palette without the stored value changing.
//
// Chosen (and checked with the dataviz validator) so every colour clears
// 3:1 against the page in both themes and any two stay apart for full
// colour vision (OKLab ΔE ≥ 15 across all pairs — pie slices sort by
// amount, so any two can end up side by side). The per-theme and
// colour-blind steps live in styles.css as --category-1…7.
export const CATEGORY_COLORS = [
  '#534195', // 1 Groceries
  '#c77510', // 2 Eating out
  '#359e59', // 3 Household
  '#b572a0', // 4 Bills & utilities
  '#2384d8', // 5 Transport
  '#a52030', // 6 Health
  '#6a6966', // 7 Other (and uncategorized)
]

// Saved colour -> palette slot. Includes the pre-September-2026 defaults,
// so a category still carrying one (a cached copy from before the palette
// migration, say) shows the same slot's new colour rather than the old
// hard-to-see one. The retired extra swatches (yellow, pink, navy) aren't
// here on purpose: those are custom colours now, shown exactly as saved.
const SLOT_BY_COLOR = new Map([
  ...CATEGORY_COLORS.map((c, i) => [c, i + 1]),
  ['#4a86e8', 1], ['#e69138', 2], ['#6aa84f', 3], ['#a479e2', 4],
  ['#45818e', 5], ['#cc4125', 6], ['#999999', 7],
])

// The colour to actually paint for a saved category colour: a preset
// becomes its slot's CSS variable (var(--category-N), which styles.css
// resolves per theme and per the colour-blind setting), a custom colour
// comes back exactly as saved, and a missing one (uncategorized) is the
// "Other" grey. Safe to call twice — an already-mapped var() passes
// through untouched. Use it wherever a category colour is painted; keep
// the raw saved value for comparisons and writes.
export function categoryColor(color) {
  if (!color) return 'var(--category-7)'
  const slot = SLOT_BY_COLOR.get(String(color).toLowerCase())
  return slot ? `var(--category-${slot})` : color
}
