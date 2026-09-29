# Button

Spesa's text buttons: `btn-primary` for the one main action on a screen, `btn-secondary` for its companion, `btn-danger` for destructive confirms, `btn-link` for low-weight text actions.

**Use**
- One `btn-primary` per view (Save, Settle up, Sign in). Pair it with `btn-secondary` for Cancel / the alternative.
- `btn-danger` only inside a confirmation (sheet, typed-confirm modal) — never as the first thing a user sees.
- `btn-link` for inline text actions ("Forgot password?", "Add a note"), in `accent-dark`.
- Add `btn-with-icon` to pair a 16px icon with the label (Settle up, History).

**Anatomy** — `radius` corners, 12×18px padding, `button` text style (15px/600). Pressed: `scale(0.98)`. Disabled: opacity 0.55.

**Consumer provides** — the label (sentence case, a verb: "Save bill", not "SAVE"), `disabled` state, click handler.

**Contrast** — labels use `on-accent` / `on-warn`: white in light, near-black in dark on the brighter fills; every label is at least 7:1. Never hard-code white.
