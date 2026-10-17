# BottomSheet

A light yes/no confirm that slides up from the bottom (`sheet-up`, 0.18s; none under reduced motion): `surface` panel, `radius-xl` top corners, `space-lg` padding plus the safe-area inset, max 480px wide, over the `scrim`.

- Every short yes/no in the app — Sign out, Leave group, deleting a bill or a category, removing a member, undoing a payment, making someone admin. The browser's own confirm dialog is never used. Anything with fields or a list uses the centered Modal.
- A 36×4px `border` grabber, a `sheet-title` question, one or two sentences of `body-sm` `ink-soft` consequences, actions right-aligned: `btn-secondary` Cancel, then the action (`btn-danger` when destructive, `btn-primary` when not), labelled with the verb, not "OK".
- Opening it moves focus onto the panel itself, with no ring drawn, so a screen reader reads the question and Tab reaches Cancel first. Escape or a tap on the `scrim` cancels.

