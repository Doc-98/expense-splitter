# BottomSheet

A light yes/no confirm that slides up from the bottom (`sheet-up`, 0.18s; none under reduced motion): `surface` panel, `radius-xl` top corners, `space-lg` padding plus the safe-area inset, max 480px wide, over the `scrim`.

- For short confirms only — Sign out, Leave group. Anything with fields or a list uses the centered Modal.
- A 36×4px `border` grabber, a `sheet-title` question, one or two sentences of `body-sm` `ink-soft` consequences, actions right-aligned: `btn-secondary` Cancel, then the action (`btn-danger` when destructive), labelled with the verb, not "OK".
