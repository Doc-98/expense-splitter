# StatsSummary

A row of equal tiles, each a figure over a muted caption: `surface` fill, 1px `border`, `radius` corners, `space-md` padding, centred.

- Figure in `stat-value` (20px/600); colour it `balance-negative` / `balance-positive` only when it is a balance.
- `.is-slim` (16px figure, `micro-caps` caption, tighter padding) for the Quick stats strip on a group page.
- Tiles share one row equally; at a large browser text size they wrap onto a second row rather than run off the screen (a 6em basis).
- The overall-balance tile is the one figure that carries a sign ("+€12.25", "−€18.30"): it has no words beside it to say which way the money goes, unlike a `BalanceLine`.
- Captions are lowercase phrases ("your share", "you fronted"). A personal "spent" figure defaults to *your share* (what you consumed), never what you fronted — label "fronted" explicitly when that is what it shows.
