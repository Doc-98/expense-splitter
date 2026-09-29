# StatsBar

Horizontal bars for spend by category, by month or against a budget: an `ink-soft` label (with the category's dot when it is a category), a 10px pill track in `accent-light` with an `accent` or category fill, and a right-aligned `mono` value.

- A list (`.stats-bars`) is one grid and every row borrows its columns (subgrid), so labels, tracks and values line up down the list. Columns size to their content: the label takes up to 40% and then wraps, indented past its dot; the value takes up to 45%; the track gets the rest, never under 40px. Nothing is cut off on a 360px phone, including long names like "Kids activities and school trips" and amounts like €12,345.67.
- Budget values ("€312.40 / €250.00") wrap only at the slash: each amount is a `.stats-bar-amount` that never breaks.
- `.over-budget` turns the fill `negative` (money out, not an error). Pair it with the amount over in the value or a caption, never colour alone.
- A category row can carry a `.comparison-badge` under it, spanning the row.
- Rows 8px apart, 13px text. The consumer provides the label, a fraction (0–1) and a formatted value.
