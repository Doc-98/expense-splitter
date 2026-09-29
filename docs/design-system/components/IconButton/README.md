# IconButton

A bare 20px stroke icon in a 6px-padded, `radius-sm` hit area (`.icon-btn`) for navigation and utility actions in headers — Search, Share, Stats, Settings.

- Idle `ink-soft`; hover and `.active-toggle` (a toggle that is on, e.g. the Settings menu) fill `accent-light` with `accent-dark` ink.
- Always give it an `aria-label`; the icon is `aria-hidden`.
- Keyboard focus shows the app-wide 2px `accent` ring around its `radius-sm` box.
- It looks 32px but taps as 44×44: an invisible `::after` grows the tap area (see Touch targets). Keep at least 12px between icon buttons (the header uses 16px) so neighbouring areas don't overlap.
- Don't use it for destructive actions — its hover reads as navigation, not "delete".
- `.account-chip` (pill, `border`, 13px/500) is the header link to Settings, showing the user's name.
