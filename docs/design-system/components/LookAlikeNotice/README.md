# LookAlikeNotice

A hint on a group's page when two or more people there would look the same on bills: the same avatar icon, or no icon and the same initial. A quiet card (`.avatar-clash-note`): `surface-tint` fill, 1px `border`, `radius` corners, 14px text.

- Left: the two identical 28px avatar circles, overlapping by half (`.avatar-pair`), so the problem is seen, not only described. They're a picture, not a control: no tap area.
- Middle: who ("**Anna** and **Andrea** look the same on bills.", "**You** and **Bruno**…") and a "Pick avatars" `btn-link` that opens Group settings on that person's row with the picker open.
- Right: a × in `ink-soft` (44px tap area) that hides it on this device until the set of people involved changes.
- A hint, not an error: no `warn` colour and no warning triangle. Shown only to someone who can fix it (the people involved, anyone when a guest is involved, the admin), one clash at a time.
