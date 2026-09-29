The app mark in every size the app ships, all generated from one source: the Fraunces 600 "S" outlined as an SVG path (so no font is needed to draw it), paper white `bg` (#FAF9F6) on `accent` (#2A6253), 7:1.

- `spesa-mark.svg` — the favicon: rounded square, 14/64 corner radius (`radius-lg`). Same file as the app's `public/favicon.svg`.
- `spesa-app-icon-512.png` — the standard ("any") PWA icon, rounded on a transparent ground (the app also ships a 192px one).
- `spesa-app-icon-maskable-512.png` — the maskable PWA icon: full-bleed, for Android launchers that crop icons to their own shape. The "S" sits well inside the 80% safe zone.
- `spesa-apple-touch-icon-180.png` — the iPhone/iPad home-screen icon: full-bleed, iOS rounds it.

Keep the mark on its own green square; never recolour it or set the "S" in another face. There is no separate wordmark: set "Spesa" in Fraunces 600, `accent-dark`.
