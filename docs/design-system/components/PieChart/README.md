# PieChart

Spending by category as a donut with its legend beside it (the legend wraps under it on a phone), on the Graphs pages. Slices go largest first, clockwise from 12 o'clock, each in its category colour (`categoryColor()`); the centre shows the period's total.

- **Never match colours by eye.** Slices of 6% or more print their percent just outside the ring in `ink-soft` (`text-md`, tabular figures), and the legend row carries the same percent, so a slice finds its name by number. Text never sits on a slice: a category colour can't carry text at 7:1. Smaller slices are labelled in the legend only.
- **Slice and legend row highlight together**, on hover, keyboard focus or tap: the slice scales up 5% and gets a 1.5px `ink` outline, its percent turns `ink` 600, and the legend row gets a `surface-tint` fill, a `border` outline and a 600 name. The centre then names the category (cut to 14 characters) with its amount and "N% of" the total.
- **On the Graphs pages a slice is also a filter.** Tapping it, or its legend row, filters the line chart to that category; the chart keeps it highlighted (`selectedKey`, `aria-pressed`), the only highlight a phone gets, and tapping it again clears the filter. Hovering another slice previews it without changing the filter.
- Read-only use (no `onSelectCategory`): slices aren't buttons and the legend buttons are disabled; hover and tap still highlight.
- Empty period: a plain `border` ring with "No spending in this period" beside it.
- 192px wide on screen: a 240-unit viewBox, the 160px donut plus room for its labels. On a wide stats page the legend stops at 440px so amounts stay near their names.
- Consumer provides: `slices` (`key`, `name`, saved colour, amount), a `format` function, and optionally `onSelectCategory` with `selectedKey`.
