# Skeleton

The loading placeholder: a faint outline of the content about to appear, instead of a bare "Loading…".

- Shapes (`.skeleton`) are `ink-soft` at 20% (`color-mix`, `accent-light` where unsupported), `radius-xs` (4px) corners, pulsing to 55% opacity over 1.4s; still under `prefers-reduced-motion`.
- Size them like the real thing: `.skeleton-row` is exactly a `CardListItem` (title bar, optional note bar and amount), `.skeleton-tile` a stats tile, `.skeleton-bar-row` a `StatsBar` row, `.skeleton-page-title` a page title, `.skeleton-chart` a graph. Vary the bar widths so a list doesn't look stamped out.
- Wrap them in a `role="status"` region whose visually hidden label names what's loading ("Loading your groups…"); the shapes themselves are `aria-hidden`.
- Show the shapes only after 300ms, so a fast load never flashes one. Pages that paint from a cache skip it entirely.
- Never show an empty state or a zero figure while the data is still loading.
