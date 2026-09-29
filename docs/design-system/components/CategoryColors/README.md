# CategoryColors

The seven category colour slots (`--category-1` … `--category-7`), shown as a dot beside the category's name wherever a category appears: bill and item rows, pie legends, stats and budget bars, the category editor.

- **Store** the preset hex on the category (`CATEGORY_COLORS` in `categoryPalette.js`, one per default category in slot order); **paint** through `categoryColor(saved)`, which returns `var(--category-N)` for a preset (current or pre-2026-09) and the saved value for a custom colour. A missing colour (uncategorized) paints as slot 7, Other.
- Never show a category colour without the category name next to it: seven colours can't be told apart by colour alone for every reader, and a tooltip doesn't count (phones never show one). A bill's items carry it on a small line under each item, or under a heading per category (see `ItemRow`); a subscription row on its own line under the details.
- Dark mode has its own lighter steps (`category-N` dark values); the colour-blind palette (`category-cb-*`) replaces slots 1–6 when `data-palette="colorblind"` is on `<html>` — a per-device switch in Settings > Layout, applied before first render.
- Dots are 10px circles (`.category-dot`); in charts, slices and bars take the same variable.
- Pie charts link each slice to its legend row by number and by highlight, not by colour: percent labels outside the ring for slices of 6% or more, the same percent in the legend, and a shared highlight (hover, focus or tap) that also names the category in the donut's centre. On the graph pages a tapped slice stays highlighted as the page's category filter; tapping it again clears it.
