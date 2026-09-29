# StatusMessage

Inline feedback under a form or action: `.status-success` (`accent-dark` on `accent-light`) and `.status-error` (`warn` on `warn-light`, with a 16px warning triangle before the text), 14px/1.4, `space-sm`×`space-md` padding (plus 24px on the left for the icon on errors), `radius` corners.

- Say what happened and what to do next, in one or two plain sentences ("Couldn't read that receipt — try a sharper photo or add items by hand.").
- A 1px border in the message's own ink (`warn` / `accent`) outlines each message; text is at least 7:1 on its fill in both themes.
- The error's triangle is what tells it apart from a debt: `warn` (rust) and `negative` (red) are too close to rely on hue. Never show an error without it, and never box a balance.
