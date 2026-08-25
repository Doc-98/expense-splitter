# Working notes for Claude Code in this repo

This file is operational guidance for how Claude Code should behave while
working in this repo — it is not project documentation. `README.md` is the
source of truth for how Spesa itself works and the conventions to follow
when changing it (working conventions, migration policy, testing
expectations, etc.) — read that first, every session.

## PR workflow

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
