# Working notes for Claude Code in this repo

This file is operational guidance for how Claude Code should behave while
working in this repo — it is not project documentation. `README.md` is the
source of truth for how Spesa itself works and the conventions to follow
when changing it (working conventions, migration policy, testing
expectations, etc.) — read that first, every session.

## PR workflow

- Only open a pull request when explicitly asked to — standing preference,
  confirmed 2026-09-18. Default to accumulating multiple rounds of work as
  plain commits on the working branch and pushing them; one PR then covers
  the whole accumulated batch, rather than a PR per small change. This
  overrides the general instruction to open a PR once a task is "complete"
  — completing a task here just means committing and pushing, unless the
  user's own request that round was to open a PR.
- After opening a pull request in this repo, subscribe to its activity
  (`subscribe_pr_activity`) immediately, without asking first — standing
  preference, confirmed 2026-08-20. Also schedule a check-in roughly an
  hour out, same as the usual PR-watching procedure.
- The point: the moment the PR is merged, a notification arrives instead
  of being discovered later. When that happens, reset the session's
  working branch straight to the new `master` tip (`git fetch origin
  master && git checkout -B <branch> origin/master`, or a plain
  fast-forward push if the local branch tip is already an ancestor of the
  new `master`) *before* any further commits land on top of it. Confirm
  first with `git merge-base --is-ancestor HEAD origin/master` — if that's
  false, there are unmerged commits on the branch beyond what's already in
  `master`, and those need rebasing onto the new tip instead of a plain
  reset (never discard them).
- This is why the dance happened once already: a PR merged mid-session,
  more commits landed on the same branch before anyone noticed, and the
  next PR needed a rebase to reconcile. Subscribing closes that gap.

## Permissions

- Everything is pre-approved in `.claude/settings.json` — shell, file
  edits, subagents/skills/artifacts, and every connected service
  (Supabase, GitHub, session tools, Trello, Vercel, Docs, Notion, Gmail,
  Google Calendar/Drive), including applying migrations to production,
  deploying edge functions, merging PRs and editing the Trello board. Go
  ahead with these without asking first — standing preference, confirmed
  2026-09-25 and again 2026-09-28. A newly connected service needs adding
  to that allow list (`"mcp__<ServerName>"`) or it will prompt.
- In cloud sessions (claude.ai/code) that file isn't enough for connector
  tools: the launcher pre-approves each connector tool from the account's
  own per-tool permissions at claude.ai/customize/connectors, and a tool
  left on "needs approval" there still prompts (seen 2026-09-28:
  `execute_sql`, and every Trello/Vercel tool). The fix is on the user's
  side, set to always allow there; connectors are read when a session
  starts. Repo hooks do run in cloud sessions (verified 2026-09-28), so the
  destructive-SQL hook below still guards `execute_sql`/`apply_migration`
  even once they're always-allowed.
- The one exception is SQL that deletes something (`DELETE FROM`,
  `TRUNCATE`, or `DROP` of a table, column, policy, function, …): that
  still needs the user's one-click confirmation. The PreToolUse hook
  `.claude/hooks/ask-before-destructive-sql.sh` enforces it on
  `execute_sql`/`apply_migration`; when a migration drops something, say
  in plain words what goes away before the prompt appears.

## Release hygiene

- `src/lib/appVersion.js`'s `WHATS_NEW` array is hand-maintained and does
  not update itself — before committing/pushing a round of work that ships
  anything user-visible, check whether `WHATS_NEW` still describes it and
  update it if not. It's drifted stale before (Settings > Updates showing
  a previous release's notes, not what actually just shipped) — standing
  preference, confirmed 2026-09-19.
- `APP_VERSION` (same file) needs no equivalent check — it's computed
  automatically at build time from git history (`readAppVersion()` /
  `findLatestVersion()` in `vite.config.js`, driven by each squash-merge
  commit's own "(#123)" suffix), so unlike `WHATS_NEW` there's nothing
  about it that can drift out of sync by hand.

## Design system

- The Spesa design system artifact
  (https://claude.ai/artifact/MS1SXZnKufV5iFF3qXPj2n) mirrors the app's
  design and is kept in sync with it — standing preference, confirmed
  2026-09-28. Any change that affects the design (colour or other tokens
  in `src/styles/tokens.css`, any rule in `src/styles/**` (a component's
  styling or states), fonts or weights
  loaded in `index.html`, `CATEGORY_COLORS`, `icons.jsx`, the logo or app
  icons, the PWA theme colour) gets mirrored into the artifact in the
  same round of work as the commit, not left for later: `tokens.json`,
  `components/bundle.css`, the brand book `README.md`, the affected
  component's README/preview, and assets. Read the artifact's
  `project/design-system.json` and each file before changing it, and set
  `lastChange.via` to `GitHub · doc-98/expense-splitter@<sha>`.
- The repo carries an identical copy of the artifact's text files in
  `docs/design-system/` (same paths as the artifact's `project/`, minus
  `design-system.json` and the image/font files, which live in `public/`,
  `src/assets/fonts/` and `icons.jsx`), so people and tools without access
  to the artifact can read it. Every artifact change is copied there in
  the same commit, byte for byte. `src/lib/designSystemTokens.test.js`
  fails if `docs/design-system/tokens.json` and `src/styles/tokens.css`
  drift apart, so a new or changed token must land in both.
- The PostToolUse hook `.claude/hooks/remind-design-system-sync.sh`
  flags any commit touching those files, but it only reminds — the rule
  above applies whether or not it fires (e.g. a design change made in a
  file it doesn't watch).
- Values stay exact and verified: check contrast for any new text/ground
  pair against the AAA rules in the brand book, and render a changed
  preview before republishing.

## Product conventions

- "Spent" / "expenses" — for a *personal* figure, unless a request
  explicitly says otherwise, this means the person's own proportional
  share of what they're actually responsible for (the `consumed` half of
  the paid/consumed split, e.g. `computeMyCategorySpend()`,
  `computeDailyTotalsForUser()`'s `.consumed`), never how much they
  fronted out of pocket for a whole bill (`.paid`) — standing preference,
  confirmed 2026-08-25. A few existing places on the stats pages do show
  "fronted" specifically (e.g. Your Stats' "By month (fronted)" chart,
  clearly labeled as such) — those stay as they are; this rule is about
  what a *new*, unlabeled "how much did you spend" figure should default
  to when it isn't specified otherwise.
