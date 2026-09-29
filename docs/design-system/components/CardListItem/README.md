# CardListItem

The row of every list in Spesa — groups, bills, payment history: a `surface-tint` card with a 1px `border`, `radius` corners and 14×16px padding, rows `space-sm` apart.

- Left: title (500 weight, wraps anywhere so a long merchant name never widens the page) and an optional one-line 12px `ink-soft` note that ellipsizes.
- Right (`.bill-row-right`): a two-line amount block — the total (600) over a 12px italic status in `balance-negative` (`negative`, "You borrowed"), `balance-positive` (`accent-dark`, "You lent"), with the amount in `.balance-amount` (600), or neutral `ink-soft` — then a `ink-soft` chevron.
- Hover: `accent` border. Pressed or keyboard-focused (`.list-row-focused`): `accent` border and `accent-light` fill.
- Current (`.is-current`, `aria-current="page"`): the bill open beside the list on a wide screen — `accent-light` fill and a 2px `accent` edge (the border plus a 1px outline), so it isn't marked by shade alone.
- Group bill rows under `.bill-month-divider` (display 15px/600 with a hairline above, except the first) and `.bill-day-divider` (mono 12px/600).
- Consumer provides: title, note, amounts already formatted with currency.
