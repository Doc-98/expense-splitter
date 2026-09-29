# EmptyState

An empty screen or section that says what it is and what to do next: an icon, a short title, one line, and a button to the next step, in a dashed frame.

- Icon: a 24px glyph from `assets/Icons` in `accent-dark` on a 48px `accent-light` circle, `aria-hidden`. Title: Fraunces 16px/600, `ink`. Text: 14px `ink-soft`, at most ~32 characters wide. Optional note under the button: 13px `ink-soft`.
- Frame: 1px dashed `border`, `radius`, `space-lg`×`space-md` padding, centred. The dash keeps it from reading as a real row or card.
- Button: `btn-primary` when it starts something ("Create a group", "Add a bill", "Add an item": each only focuses the field that creates the thing); `btn-secondary` when it only takes you somewhere ("Back to the group", "Settle up", "Go to your groups", "Clear filters"). Buttons here are 14px with 10×16px padding. Never a new flow of its own, and never "above"/"below" in the text: the button is the direction.
- A section-level empty (no spending in a chosen period) may drop the button when the fix is right above it (the period selector).
- Never shown while data is still loading: that's `Skeleton`.
- Consumer provides: the icon, title, text, and the finished button or link element.
