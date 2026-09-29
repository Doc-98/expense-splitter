# TabRow

A segmented control: a `bg` track with `radius-md` corners and 4px padding holding equal-width tabs; the active tab lifts onto `surface` with `shadow-tab`, a `border` outline and `ink` text at 600; the others stay `ink-soft` at 500.

- Use for two to five mutually exclusive views of the same content — sign in / sign up, the stats time range (Week · Month · Year · All).
- Labels are one or two words, sentence case.
- Each tab taps as at least 44px tall (an invisible `::after`, vertical only) even though the track is 42px.
- The active tab also gets a 1px `border` outline and 600 weight, since `surface` on `bg` is too close in shade to show selection alone.
