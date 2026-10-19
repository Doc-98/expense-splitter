# BalanceLine

Who owes whom in a group, one line per debt: "You owe **Marta** €12.40" in `negative`, "**Luca** owes you €8.00" in `accent-dark`. The two directions are always treated alike.

- A per-device setting (Settings > Layout) colours either the whole line (`.balance-line.balance-negative` / `.balance-positive`) or only the amount (the class on the `.mono` amount instead). Whatever one direction gets, the other gets too.
- The person's name is 600, and the amount is `mono` 600 in both modes: it's the part that matters most.
- No sign on the amount ("−€12.40"): the words and the colour already say which way the money goes.
- Never box a balance or give it the warning icon. Those mark errors (`warn`), which are a different red.
- **Net balance**, what you're owed minus what you owe, shows only when there are two or more lines to add up. A per-device setting (Settings > Layout) picks where: above the lines as a `.balance-line` with **Net balance:** in bold (the default), under them as `.balance-net-total` (a 1px `border` rule, "Net" in `ink-soft` 13px on the left, the total on the right), as `.balance-net-note` (one 13px `ink-soft` line, only the amount coloured), or not at all. The direction is always in words ("you're owed", "you owe"), and the amount is `mono` 600 in every layout.
- Consumer provides: the direction, the other person's name and the formatted amount.
