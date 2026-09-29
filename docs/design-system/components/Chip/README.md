# Chip

Pill toggles for choosing people or categories (`.buyer-chip`), and their compact form, 36px initial circles (`.avatar`) used on item rows and split pickers.

- Off: 1px `border`, `ink-soft` text. On (`.active`): chip gets `accent-light` fill, `accent` border, `accent-dark` text; avatar gets a solid `accent` fill with white initial.
- `.former` (dashed border, full opacity) marks someone who has left the group but still appears on old bills.
- Disabled avatars (already picked on the other side of a payment) drop to 0.3 opacity.
- Lay chips out in `.chip-row` with a 6px (`space-xs`) gap, and avatars in `.avatar-row` with an 8px gap: 36px + 8px is a 44px pitch, so each avatar's invisible 44px tap area meets its neighbour's exactly. Double-tapping an avatar means "only this person".
- Avatar size follows Settings > Profile: small 36px (default), `.avatar-md` 42px, `.avatar-lg` 48px, with icons at 19 / 22 / 25px.
