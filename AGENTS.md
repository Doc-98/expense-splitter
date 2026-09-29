# Working on Spesa (for AI coding agents)

Spesa is a PWA for splitting receipts and shared expenses: React 19 +
Vite, Supabase, plain CSS. This file is the short version for any AI tool
working in this repo; people can read it too.

- **Read `README.md` first.** It is the source of truth for how the app
  works and the conventions to follow (project structure, migrations,
  testing).
- **Read the design system before changing anything a person sees:**
  `docs/design-system/README.md` (the brand book), `tokens.json`, and the
  card for the component you're touching (`components/<Name>/README.md`).
  The rules there are requirements, not suggestions: AAA contrast (7:1
  text) in both themes, 44px touch targets, a category colour never shown
  without its name, state never shown by shade alone, sizes only from the
  named tokens (`--text-*`, `--space-*`, `--radius-*`, `--z-*`).
- **Styles:** `src/styles/tokens.css` holds every token; the rest of
  `src/styles/` is split by area and ordered by cascade layers declared in
  `src/styles.css`. Add a rule to the file for its area; never hard-code a
  colour, size or shadow that a token covers.
- **Keep the design system in step.** A change to a token, a component's
  look or states, fonts, icons or the logo is mirrored in
  `docs/design-system/` in the same commit (tokens, the component's card
  and preview, `bundle.css`, the brand book). `src/lib/designSystemTokens.test.js`
  fails when `tokens.json` and `tokens.css` disagree.
- **Before committing:** `npx vitest run` and `npx oxlint` must pass.
- `CLAUDE.md` holds operational notes for Claude Code specifically
  (PR workflow, permissions, release notes); its product conventions apply
  to everyone, e.g. a personal "spent" figure means your own share, not
  what you fronted.
