# TextInput

Inputs, date fields, selects and the note box: 1px `border-strong` (3:1: the outline is the field, so it is never the quieter `border` that cards use), `radius-sm`, 10×12px padding on `surface`, always 16px text (prevents iOS zoom-on-focus). Focus: 2px solid `accent` outline, 1px offset, on every focus (tap included), unlike other controls, which ring on keyboard focus only.

- Wrap every input in a `label` — the label text sits above in 13px `ink-soft`.
- `.field-hint` (12px, muted) for a one-line caption directly under a field.
- `.input-with-submit` puts a 30px `accent` circle with an arrow inside the field's right edge ("Create a new group", "Add bill"). The button is `disabled` until the field has non-whitespace text; while disabled it is invisible (opacity 0, scale 0.8) and fades in as you type.
- Placeholders are examples, not instructions.
- A borderless field inside a styled strip (the guide's search) keeps `outline: none` on the input but rings the strip with `:focus-within`, same colour and width.
