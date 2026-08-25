# Spesa — Expense Splitter (PWA)

A phone-installable rebuild of the old JavaFX receipt splitter. Snap a photo
of a receipt (or type items in by hand), assign who's buying what, and see a
live, real-time settle-up with everyone in your group — no app store
required.

**What it does:**

- Scan a receipt (free, on-device OCR, or your own Gemini/Claude/Ollama key)
  or add items by hand, with live per-person settle-up as you go
- Split a bill across as many people as you like, including guests with no
  account at all
- Front a bill with more than one payer, each with their own amount
- Tag bills and items by category to see not just how much you spend, but
  on what — and set your own personal monthly budget per category
- Share a recap as text, a PDF, or a CSV — or import your whole spending
  history straight from Splitwise
- Track your own stats across every group you're in, even ones you've left

Nothing here is deployed for you — this is real, runnable source code you
deploy to your own free Supabase + Vercel account, so *you* own the data and
the (tiny) hosting bill. Setup takes about 20 minutes the first time.

## Contents

- [How it's built](#how-its-built)
- [Setup](#1-create-your-supabase-project)
- [Resetting the database](#resetting-the-database)
- [Receipt scanning](#receipt-scanning)
- [Editing items](#editing-items)
- [Backdating (or postdating) a bill](#backdating-or-postdating-a-bill)
- [Currency](#currency)
- [Categories](#categories)
- [Spending thresholds](#spending-thresholds)
- [Period-over-period comparison](#period-over-period-comparison)
- [Time period controls](#time-period-controls)
- [Keyboard navigation](#keyboard-navigation)
- [Recurring bills](#recurring-bills)
- [What a bill row shows](#what-a-bill-row-shows)
- [Searching and filtering bills](#searching-and-filtering-bills)
- [Bill actions: deleting and sharing](#bill-actions-deleting-and-sharing)
- [Your groups: layout and card style](#your-groups-layout-and-card-style)
- [Inviting people](#inviting-people)
- [The in-app guide](#the-in-app-guide)
- [Recaps, PDFs, and CSV](#recaps-pdfs-and-csv)
- [How the data model works](#how-the-data-model-works)
- [Roadmap](#roadmap)
- [What's intentionally left simple (v1)](#whats-intentionally-left-simple-v1)
- [Security notes](#security-notes)

## How it's built

- **Frontend**: React + Vite, packaged as an installable PWA (`vite-plugin-pwa`)
- **Backend**: [Supabase](https://supabase.com) — Postgres database, auth,
  realtime sync, all on the free tier to start
- **Receipt scanning**: no server, no shared API key, and no per-store parsing
  code required by default — see [Receipt scanning](#receipt-scanning) below
- **Settlement**: `src/lib/settlement.js` computes net balances per person and
  simplifies them into the minimum number of payments needed to settle up

## 1. Create your Supabase project

> **Updating an existing installation from before guests/multi-payer
> support?** That version restructured how `bills`, `items`, and `payments`
> reference people — supporting guests with no account meant every "who is
> this about" column had to point at a new `group_members.id` instead of a
> real account ID directly. There's no migration path from that older
> schema; see [Resetting the database](#resetting-the-database) below. Every
> feature added since then (multiple payers, categories, admin roles) ships
> as a normal additive migration instead — no reset needed for those.

1. Go to [supabase.com](https://supabase.com) → New project (free tier is fine).
2. Once it's created, open **SQL Editor** → New query, paste in the entire
   contents of [`supabase/schema.sql`](supabase/schema.sql), and run it. This
   creates every table, security policy, and the profile-creation trigger.
3. Go to **Database → Replication → supabase_realtime** and toggle *on*
   realtime for these six tables: `bills`, `items`, `item_shares`,
   `bill_payers`, `payments`, `group_members`. This is what makes edits show
   up live on every phone in the group without refreshing.
4. Go to **Authentication → Sign In / Providers** and make sure **Email** is
   enabled (it is by default). If you want magic-link sign-in to redirect
   back to your deployed app instead of `localhost`, add your deployed URL
   under **Authentication → URL Configuration → Site URL** once you've
   deployed the frontend (step 3 below).

## 2. Get your API credentials

In **Settings → API**, copy:

- **Project URL**
- **anon / public key** (safe to expose in frontend code — it's designed for
  this; every table is locked down by the row-level security policies in
  `schema.sql`, not by hiding this key)

Copy `.env.example` to `.env` in the project root and fill both in:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

## 3. Run it locally / deploy it

Local dev:

```bash
npm install
npm run dev
```

Deploy the frontend anywhere that serves a static site — [Vercel](https://vercel.com)
or [Netlify](https://netlify.com) both have generous free tiers:

1. Push this folder to a GitHub repo.
2. Import it in Vercel/Netlify, build command `npm run build`, output dir `dist`.
3. Add the two `VITE_SUPABASE_*` environment variables from step 2 in the
   host's dashboard.
4. Deploy. Copy the resulting URL back into Supabase's **Site URL** setting
   from step 1.4 so magic links redirect correctly.

## 4. Install it on a phone

Once deployed, open the URL on a phone:

- **iOS Safari**: Share button → *Add to Home Screen*
- **Android Chrome**: menu (⋮) → *Install app* (or it'll prompt automatically)

It now behaves like a native app icon — full screen, no browser bar.

## Resetting the database

Only relevant to the guest/multi-payer schema change flagged above — skip
this entirely on a brand new project, or if you're just picking up recent
feature updates (those apply as plain additive migrations; see each
feature's own migration file). Run this in the SQL Editor first, then run
the entire `schema.sql` file straight after it in a second query. This only
removes the specific tables/functions this project created — it
deliberately avoids touching the `public` schema itself or Supabase's own
default permissions on it, which a broader reset (`drop schema public
cascade`) would wipe out and require manually restoring.

```sql
drop function if exists public.remove_group_member(uuid, uuid, text, numeric, jsonb);
drop function if exists public.join_group_by_code(text);
drop function if exists public.create_group(text);
drop function if exists public.is_group_member(uuid);
drop function if exists public.handle_new_user() cascade;

drop table if exists departure_snapshots cascade;
drop table if exists payments cascade;
drop table if exists item_shares cascade;
drop table if exists items cascade;
drop table if exists bills cascade;
drop table if exists group_members cascade;
drop table if exists groups cascade;
drop table if exists profiles cascade;
```

This does **not** delete anyone's actual login (`auth.users` is untouched) —
just re-run the "add themselves"/"join group" steps of the app again
afterward (create a fresh group, everyone re-joins via a new invite link).

## Receipt scanning

There's no server-side piece to deploy for this at all — every scanning
strategy runs entirely in the browser, chosen per-person from **Scan
settings** (account menu → Scan settings), stored only on that device.

- **Free OCR (default, zero setup)** — before OCR even runs,
  `src/lib/receipt-parsing/imagePreprocess.js` cleans up the photo: converts
  to grayscale and binarizes it (pure black text on white) using a local,
  per-region contrast threshold rather than one fixed cutoff for the whole
  image — the same technique real scanner apps use, and what actually
  matters for a phone photo with a shadow or uneven lighting across it,
  which a single global threshold handles poorly. Tesseract.js then runs
  OCR on the cleaned-up image, and `lineParser.js` groups the recognized
  words into item/price pairs using their position on the page (name on the
  left, price on the right — the one layout convention nearly every receipt
  follows, regardless of store). A negative price right after an item (a
  discount line) comes through as its own line rather than being dropped —
  the total still nets out correctly either way, it just shows as two lines
  instead of one adjusted price, since a rule-based parser can't reliably
  tell *which* item a discount belongs to the way a real model can. No
  account, no key, no server, no per-store templates to maintain.
- **Google Gemini (bring your own key)** — more accurate, handles messy
  receipts better. Each person gets a free key at
  [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
  and enters it in Scan settings; the app calls Gemini directly from the
  browser with it. Nothing about this needs a Supabase deployment either —
  it's a straight fetch from the phone to Google using that person's own key
  and their own free-tier quota.
- **Anthropic Claude (bring your own key)** — the same model this app's
  scanning originally ran on, now with each person's own key from
  [console.anthropic.com](https://console.anthropic.com) instead of one
  shared server secret. Not a free tier, but a single scan costs well under
  a cent. Calls Anthropic directly from the browser using their
  `anthropic-dangerous-direct-browser-access` header — a real, documented
  opt-in for exactly this BYOK pattern, not a workaround.
- **Local Ollama (private, your own hardware)** — runs on a computer on your
  own network; a receipt photo never leaves your house. Needs a decent
  computer with a vision-capable model already pulled (`ollama pull
  qwen2.5vl`, or `llama3.2-vision` as an alternative). **Ollama blocks
  cross-origin browser requests by default** — since this app runs on a
  different origin than `localhost:11434`, you must set the `OLLAMA_ORIGINS`
  environment variable on the machine running Ollama (to this app's address,
  or `*` for simplicity) and restart Ollama, or every scan attempt will fail
  with a network error even though Ollama itself is running fine. This is
  the single most common way this option trips people up.

Adding yet another provider (OpenAI, Mistral, anything else) means writing
one more file under `src/lib/receipt-parsing/strategies/` that matches the
existing shape (`id`, `label`, `isConfigured()`, `parse(imageBase64,
mediaType)`), and listing it in `src/lib/receipt-parsing/index.js`.
`spatialStrategy` always stays available as the no-config fallback, so
scanning never fails outright even with nothing else set up. All three
cloud/local model strategies share one prompt
(`src/lib/receipt-parsing/extractionPrompt.js`), which — unlike the
rule-based OCR path — asks the model to actually merge a discount into the
item it belongs to when that's clear from the photo, falling back to a
separate negative-price line only when it can't confidently tell which item
a discount applies to.

The **old, server-side approach still exists** in
`supabase/functions/parse-receipt/` (calls Claude using a single shared,
hardcoded `ANTHROPIC_API_KEY` secret) but isn't wired up to anything
anymore — kept only as a reference/starting point if you'd rather run a
centralized paid option for your own household than rely on BYOK.

## Editing items

Every value on an item's row — its name, and (see below) its unit price,
quantity, and total cost — is click/tap-to-edit directly in place
(`src/components/InlineEditable.jsx`): click it, it becomes a text input;
Enter or clicking away saves, Escape reverts. Confirming an **empty** box
— cleared and then Enter/click-away, not Escape — also always reverts
rather than saving, enforced by `InlineEditable` itself rather than left
to each field's own validation: a numeric field's "is this a valid
number" check alone isn't enough here, since an emptied box parses to
`0` (a perfectly valid number, not an error) and would otherwise silently
save a price as zero instead of leaving it alone. No Edit button, no
separate form — a typo'd name or a scan that misread a price gets fixed
without deleting the item and re-adding it (and re-picking who's
splitting it) from scratch. The only visual cue that a value is editable
is a faint
dotted underline, deliberately the same dotted style as the receipt-style
leader line already running between an item's name and its price — the
idea is that "dotted means editable/structural" reads as one consistent
piece of this app's visual language rather than a new UI element bolted
on. `InlineEditable` itself is generic (just "click this, get a text
input, commit or revert") — `ItemRow.jsx` supplies the validation for
each of the four fields it uses it for.

The row shows more than just the total now, specifically to make editing
a multi-quantity item unambiguous: **unit price × quantity**, in a smaller
size than the total, sitting directly left of it — e.g. "$1.29 x 2 $2.58".
At quantity 1 the unit price is hidden (it's always identical to the total
right next to it, so showing it twice would be redundant) but the
quantity itself always stays visible as "x 1" — otherwise a quantity-1
item would have no click target for its quantity at all.

With three separately editable numbers that all relate to each other
(`unit_price × quantity = total_price`), each edit reconciles the other
two consistently (`updateItemField()` in `BillView.jsx`):

- Editing **unit price** or **quantity** *forward-solves* the total — the
  other of the two stays exactly as it was, and the total recalculates
  from it.
- Editing the **total** *back-solves* the unit price instead — quantity
  stays fixed, and unit price becomes whatever makes the math work out
  (`Math.round((total / quantity) * 100) / 100`). A receipt line like
  "2× Milk, $1.29 each" corrected to a $3.00 total keeps quantity at 2 and
  updates unit price to $1.50, rather than leaving a stale $1.29 that
  would silently disagree with the corrected total in a CSV or recap
  export (both show quantity and unit price as their own columns).

For the overwhelmingly common quantity-1 case, editing the total and
editing the unit price are the same operation by definition — there's
only one number to edit either way.

## Backdating (or postdating) a bill

There's no separate "date" column on a bill — `created_at` already doubles
as its date everywhere in the app (sorting, month/day grouping, stats),
including for imported bills, whose `created_at` is deliberately set to the
historical date rather than the moment the import ran (see "Importing from
Splitwise" below). A bill's own click-to-edit date, in a bill's own page
just above the item list (right next to "New items split with"), edits
that same column directly — no new column, no migration, just a plain
`UPDATE` on the field already doing this job (`src/lib/billDate.js`,
`updateBillDate()` in `BillView.jsx`).

Deliberately small and right-aligned rather than a prominent form field —
most bills are added the same day they happened and never need this, so
it stays out of the way for the common case. It's there for the rest: a
bill added a few days late that would otherwise land in the wrong week's
report, or fixing up a bill by hand after an import missed it. Editing it
keeps the bill's original time-of-day, only swapping the calendar day, so
it doesn't silently reorder relative to other bills from the same day by
landing on midnight. Uses the same `InlineEditable` component as item
editing above, extended with an `inputType` prop (`"date"` here, `"text"`
everywhere else) so it gets the browser's native date picker rather than a
free-text box — the one visible difference from an ordinary click-to-edit
field.

## Currency

The account menu has a currency picker — a curated set of major currencies
(EUR, USD, GBP, CHF, JPY, CAD, AUD), not the full ISO list, and not real
multi-currency support. Every amount stored in the database has always just
been a plain number with no currency attached at all, so this is purely a
*display* preference — which symbol to show, nothing more — stored locally
per device (`src/context/CurrencyContext.jsx`), same mechanism as dark mode.
Two people in the same group can genuinely see different symbols for the
same underlying numbers if they've each picked differently; nothing about
the data itself changes.

## Categories

Every group starts with a small seeded set of categories (Groceries, Eating
out, Household, Bills & utilities, Transport, Health, Other) the moment it's
created, so tagging is useful immediately without any setup — add, rename,
or delete freely from Group Settings.

A bill's category is the common case — one tap in Bill view covers the
whole receipt. An individual item can be tagged separately when it
genuinely belongs somewhere else (a gift picked up during a grocery run);
otherwise it just inherits whatever the bill is tagged as. `bills` and
`items` each have their own nullable `category_id`, and
`computeCategoryTotals()` (`src/lib/categoryStats.js`) resolves the
*effective* category per item — its own if set, otherwise its bill's,
otherwise "Uncategorized" — before summing. Deleting a category in use
doesn't delete or block anything; every bill/item that referenced it just
falls back to uncategorized (`on delete set null` on both FK columns).

This lives entirely separate from `settlement.js` — category totals are a
"where did the money go" question, nothing to do with who owes whom, so
there was no reason to entangle the two.

## Spending thresholds

A personal monthly budget per category, set at **account menu → Spending
thresholds** — deliberately a *profile*-level setting, not a group one: it's
a measure of your own spending, and you're very possibly in more than one
group. (A group-level or shared variant is a plausible future addition, but
low priority — nothing about the data model rules it out later.)

The page shows one amount field for each of the seven default categories
(always available, even before you've joined a group) plus one for every
custom category across every group you're currently in. **Categories with
the same name are treated as one and the same budget** — trimmed and
case-insensitive, so a "Wine" tag in one group and a "wine" tag in another
merge into a single threshold, and a category named the same as one of the
defaults (in any group) counts toward that default's budget rather than
getting its own separate row. This is the one piece of behavior here worth
internalizing, since it's not obvious from the UI alone — it's called out
again on the Thresholds page itself, and in [the in-app
guide](#the-in-app-guide).

Once set, a threshold shows up as a progress bar on [Your
Stats](#how-the-data-model-works) (`/stats`) — always compared against the
*current calendar month* specifically, regardless of whatever period Your
Stats' own selector is showing for its other numbers, and always your own
proportional share of what's been spent (`item_shares`-weighted, via
`computeMyCategorySpend()` in `src/lib/categoryStats.js`), not what you've
fronted for anyone else. A bill you paid for the whole group only counts
your own portion toward your budget, the same "fronted vs. share" split the
rest of the app already draws everywhere else.

`spending_thresholds` is keyed by `(user_id, category_name)` rather than
`category_id` — a category name has a different UUID in every group's own
`categories` table, so matching by name is what makes the "same tag across
groups" merging in the paragraph above actually work; see the table's own
comment in `schema.sql` for the full reasoning.

## Period-over-period comparison

Both Group Stats and Your Stats compare whatever period you're looking at
(week/month/year, not "all time" — there's no period before that to
compare against) with the equivalent previous one — "▲ 15% vs last period"
next to a total, and the same next to each category's bar in a "By
category" breakdown. `comparePeriods()` (`src/lib/periodComparison.js`) is
a small pure function shared by both pages; the one thing worth knowing is
that a percentage change *from* zero isn't mathematically meaningful, so a
category with nothing spent in the previous period shows "new vs last
period" instead of a nonsensical percentage. `ComparisonBadge`
(`src/components/ComparisonBadge.jsx`) is the one shared component that
renders the result identically on both pages.

Your Stats compares two different things, since it's a personal,
cross-group view: the "you fronted" / "your share" totals at the top, and
the "By category" breakdown below that. Both include departed groups —
each departure snapshot's `daily_totals` keeps a day-by-day paid/consumed
figure *and* a category breakdown of that day's consumed portion (see
[Leaving a group and personal stats](#leaving-a-group-and-personal-stats)),
so a previous period's sum is recoverable from either the same way the
current period's already was. The one gap is a snapshot recorded before
that category breakdown existed: its days simply have no category data to
draw from, so that group's spending still counts toward the top totals for
whatever period it falls in, just not toward any specific category —
`mergeCategorySpend()` (`src/lib/categoryStats.js`) is what combines live
and snapshot-derived category totals, and it degrades to exactly this for
an old snapshot without anything needing to special-case it.

## Time period controls

`TimeRangeSelector` (`src/components/TimeRangeSelector.jsx`) is the
week/month/year/all-time picker shared by Group Stats and Your Stats, with
four things worth knowing:

- **Which year, in week view** — month view's label already spells out
  the year ("August 2026") and year view obviously is one, but a week's
  own label ("Aug 17 – Aug 23") never did, so it's easy to lose track of
  which year you're looking at after a few jumps back. Week view now
  shows the year on its own line above the date range (`getPeriodRange()`
  in `src/lib/timeRange.js` returns it as `yearLabel`, alongside the
  existing `label`; both other granularities simply don't return one,
  since it'd be redundant with what their own label already says). A week
  that spans a year boundary (Dec 29 – Jan 4) shows both years.
- **Jumping across long spans** — alongside the ordinary ‹ / › single-step
  arrows, month view gets a ‹‹ / ›› pair that jumps a full year (12
  months) at a time. Week view gets *two* extra tiers instead of one:
  ‹‹ / ›› for a month (4 weeks) and ‹‹‹ / ››› for a year (52 weeks) — a
  year-jump alone still leaves up to ~25 single-step clicks to land on a
  specific week within the right year, so the month tier sits between the
  single step and the year jump. Without any of this, checking a week
  from two years ago meant clicking › roughly 104 times. Year view has no
  extra tiers of its own — a single ordinary step there is already a full
  year, so a bigger one wouldn't solve the same problem. `JUMP_TIERS` in
  `TimeRangeSelector.jsx` is the one place both granularities' tiers are
  defined, smallest first; the component works out chevron counts and
  left/right ordering from that list, so a third tier (or a different
  amount) is a one-line change, not a rewrite.
- **A default period, shared everywhere** — every stats page (Your Stats,
  and every group's own Stats page) opens on whatever granularity is set
  as your default (out of the box, "Month"), always with the current one
  selected, never a specific frozen point in time. Change it any time:
  browse to a different tab and a small "Set \_\_\_ as default" link
  appears beneath the tabs; your saved default itself is always shown with
  a thin outline around its tab — separate from which tab is *active*
  right now, since you can be looking at Year while Month stays your saved
  default. It's one preference, not one per group or one for Your Stats
  specifically — setting it from a group's Stats page changes what Your
  Stats opens on too, and the other way around, since it's "how you like
  to look at spending," not something tied to any one group.
  `TimeRangeSelector` itself doesn't know or care which page is rendering
  it: `defaultGranularity`/`onSetDefault` are just optional props, and
  every page that wants the feature passes the same
  `getStatsPreferences()`/`setStatsPreferences()` pair
  (`src/lib/statsPreferences.js`) to read and write it.
- **Where "Spending thresholds" sits on Your Stats** — pinned to either the
  very top of the page (above the period selector) or the very bottom
  (after everything else), never in between, since thresholds are always
  this-month regardless of the selector while every other section on the
  page moves with it — sitting in the middle read as confusing once
  thresholds existed alongside a period selector. Since there's no
  obviously-correct choice, it's a per-device preference toggled from a
  link right in that section ("Show at top/bottom instead"), not a fixed
  decision.
- **A recent window loads first, older history backfills after** — Group
  Stats and Your Stats both fetch this year plus last year's worth of
  bills up front, render immediately, then fetch the rest of the history
  in the background (`getStatsWindowStart()`/`isViewCovered()` in
  `src/lib/timeRange.js`). That covers every default view's own
  current-vs-previous comparison exactly (week and month trivially fit
  inside it; year needs precisely "this year plus last year," which is the
  boundary itself) — only "All time," or paging back further than a year,
  ever needs the backfill to have finished. While it hasn't, a small note
  says so rather than the numbers just silently being short a few years of
  bills; on Your Stats specifically, that note stays up until the backfill
  finishes regardless of which period is selected, since the "overall
  balance (now)" figure there is never period-scoped and always needs
  every bill and payment to be correct.

Both preferences above (default granularity, thresholds position) live in
`localStorage` (`src/lib/statsPreferences.js`), the same per-device-only
mechanism already used for currency and dark/light mode — they won't
follow you to a different phone or browser.

The ‹ / › single-step buttons above also respond to the ← / → arrow keys —
see [Keyboard navigation](#keyboard-navigation).

## Keyboard navigation

Several places in the app respond to the keyboard, all opt-in in the sense
that they only kick in once you've actually pressed one of the keys —
nothing changes about how the page looks or behaves until then, and typing
into a field (search, an amount, a filter) is never intercepted.

- **A group's bill list, and the landing page's groups list**
  (`src/pages/GroupView.jsx`, `src/pages/Groups.jsx`) — ↑ / ↓ move a
  highlighted selection up and down the current page's rows (same visual
  treatment as a hover, just keyboard-driven and stays put), Enter opens
  whichever row is highlighted, and ← / → flip pages, same as clicking the
  Pagination buttons below the list. Moving the mouse back over the list
  drops the highlight again — the same "goes away until you touch the
  keyboard again" convention as Gmail's j/k, so the first row isn't
  sitting outlined for a mouse-only visit that never asked for it. Both
  lists share one hook (`src/lib/useListKeyboardNav.js`) for this rather
  than keeping two independent copies of the same behavior — the bill
  list's version additionally turns itself off in select mode, where
  arrow keys/Enter already mean something else (moving through
  checkboxes). Recurring bills' own list (`/groups/:groupId/recurring`)
  deliberately doesn't get this: unlike a bill or a group, a template row
  has nothing to "open" — it's managed right there in the list (Pause /
  Delete), not on a page of its own — so there's nowhere for Enter to go.
- **A group's bill list, specifically** also gets `/` to jump straight to
  the search box from anywhere on the page, same shortcut GitHub/Slack use
  for their own search — opening the search section first if it's
  currently collapsed (see [Searching and filtering
  bills](#searching-and-filtering-bills)).
- **Stats pages** (`TimeRangeSelector`, shared by Group Stats and Your
  Stats) — ← / → step to the previous/next period, the same single step as
  the ‹ / › buttons next to the period label. Doesn't cover the jump
  tiers (a month or year at a time, see [Time period
  controls](#time-period-controls) above) or "All time," where there's no
  previous/next period to step to.
- **Escape closes whatever's open** — the account menu, a bill's own
  action menu, the member-count popover, the invite/share popovers, and
  the bill list's search section and its filters panel. The first four all
  already close on an outside click (`src/lib/useClickOutside.js`), which
  now also listens for Escape (`src/lib/useEscapeKey.js`) rather than only
  a click; the search section and filters panel have no floating "outside"
  of their own to click away from — both are inline panels toggled by
  their own button — so they use the Escape hook directly instead.

**Why the bill list's Pagination bar is sticky now:** a page of bills can
run from a couple of rows to a full screen depending on how many day/month
dividers land on it, so the ‹ / › buttons used to end up in a different
spot on screen every time you flipped pages — sometimes below the fold,
meaning a scroll just to find them again before you could flip once more.
`.pagination` (`src/styles.css`) now sticks to the bottom of the viewport
instead of sitting inline at the end of the list, floating as its own pill
(same border/shadow as the account dropdown) so it's always in the same
place. This applies everywhere `Pagination` is used, including the groups
list on the landing page, not just the bill list.

## Recurring bills

A template for something that repeats — rent, a subscription, a recurring
utility bill — set up per-group at `/groups/:groupId/recurring`. A
template covers a fixed amount, one payer, and a fixed set of people
splitting it each time; it deliberately doesn't try to templatize a fully
itemized receipt, since the motivating cases (rent, utilities) are lump
sums, not baskets of individual items. A specific occurrence, once
created, is just an ordinary bill — including switchable to multiple
payers, same as any other.

**How occurrences actually get created is worth understanding clearly**:
there's no scheduled job or background process anywhere in this app.
Instead, `processDueRecurringBills()` runs the moment anyone opens the
group, checks every active template's `next_due_date` against today, and
creates whatever's due — *every* missed occurrence in order if the group's
gone quiet for a while, not just the most recent one, since rent still
happened each of those months even if nobody opened the app to record it.
This is a deliberate tradeoff: this app has no cron/background
infrastructure anywhere else, and adding one just for this would be a
meaningfully bigger commitment than the feature calls for. The honest cost
is that a bill appears exactly when it's generated (the next time someone
opens the group), not exactly on its due date.

The date math itself (`src/lib/recurringBills.js`) is the one genuinely
fiddly part of this feature — clamping "the 31st" to the last day of a
shorter month, and correctly *recovering* back to the 31st the next time a
long-enough month comes around rather than drifting permanently shorter,
plus the equivalent for leap years. It's kept as a small set of pure,
heavily-tested functions separate from the database-writing code around
it, for exactly that reason.

Deleting a template asks what to do with the bills it's already
generated — shown with a real count and total, not a vague warning. The
default, "Keep the bills," just detaches them (`bills.recurring_bill_id`
goes back to null); "Delete the bills too" is a separate, explicit choice,
for undoing a template that turned out to be a mistake entirely rather
than manually deleting each wrongly-generated bill by hand.

## What a bill row shows

Each bill in the group's list shows more than just its name and note now
— aligned to the right, vertically centered against that two-line block,
is the bill's total (same size as the name, bold, on that same visual
line) and, underneath it pairing with the note line, what that
*specific bill* means for you personally, in italics:

- **"You borrowed [amount]"**, tinted the same red/orange
  (`balance-negative`) the group's overall balance already uses for a
  negative number, if your share of this bill's cost was more than what
  you personally fronted for it.
- **"You lent [amount]"**, tinted the same green (`balance-positive`) the
  overall balance already uses for a positive one, if you fronted more
  than your own share.
- **"You are not involved"**, in the same muted tone as the note text
  above it, if you're neither a payer nor assigned to any item on this
  bill at all.

This is deliberately a *per-bill* figure, independent of the group's
running balance shown further down the page — fronting this one bill
entirely doesn't mean you're "owed" overall if you're behind on others.
`loadSettlement()` already assembles every bill's items/shares/payers to
compute the group's pooled balance; the same per-bill breakdown is kept
around instead of being discarded once pooled, so this doesn't need its
own query.

One deliberate edge case: fronting a bill entirely for yourself (you paid
it, you're the only one on it) nets to exactly zero — that reads as "You
lent 0.00" (green), not "not involved", matching the exact `< 0 ?
negative : positive` convention the group's own overall balance already
uses for a zero balance elsewhere on this page. "Not involved" is
reserved specifically for zero *participation* — no payment from you and
nothing assigned to you — not zero *net*.

## Searching and filtering bills

A group's bill list has a search bar (same "receipt tape" look and the
same plain, case-insensitive substring matching as the in-app guide's own
search) plus a **Filters** button next to it that opens a panel — closed
by default, so it stays out of the way until someone actually wants it.

The search bar itself starts collapsed too, behind a **Search** button
next to Invite — the same reasoning as Filters, one level up: search and
filtering are for digging through old bills, not the everyday flow of
adding a new one and settling up, so neither should sit expanded on
screen by default. Opening it (the button, or `/` from anywhere on the
page — see [Keyboard navigation](#keyboard-navigation)) reveals the
search bar between the Invite row and "Add a bill," with a small ↑ at its
own right edge to collapse it again; a search or filter left active while
collapsed shows as a "•" on the Search button, same convention the
Filters button already uses for the same thing. Collapsing it doesn't
clear whatever's currently set — reopening shows exactly what you left,
same as Filters' own panel already works.

`src/lib/billFilters.js` has the pure matching logic behind all of it,
each piece independently testable and combined with plain `&&`
(`filterBills()`): a bill has to pass the search text, the tag filter, and
the price range all at once to appear. Pagination and the month/day
grouping only ever see whatever's left after filtering — same as they
only ever saw the full list before this existed — and changing any filter
jumps back to page 1 of its new results rather than stranding you on
whatever page you happened to be on.

- **Search** — matches a bill's title *or* note, case-insensitive, as a
  plain substring — a fragment like "read" matches "Sourdough bread" via
  the title alone, same shape as `Guide.jsx`'s own search.
- **Tags** — a bill's effective tag set is every item's own category if
  it has one, else the bill's own category, else the same synthetic
  `'uncategorized'` bucket `computeCategoryTotals()` already uses
  elsewhere (so untagged bills stay filterable rather than invisible to
  every tag filter). One tag selected: the bill needs at least one item
  carrying it. Several selected, a **Match any / Match all** switch
  decides how: *any* means the bill needs at least one of the selected
  tags somewhere in it (OR); *all* means every selected tag has to be
  represented somewhere in the bill, each by at least one item, not
  necessarily the same one (AND) — items in this app only ever carry one
  category each, so "the same item satisfying two tags at once" could
  never happen regardless.
- **Amount** — a two-handle slider (`src/components/RangeSlider.jsx`,
  built from two overlapping native range inputs rather than a new
  dependency) bounded by the group's actual cheapest and most expensive
  bill, narrowing the list to bills whose total falls in between. The
  bounds are read once when bills first load; a pricier bill arriving
  later doesn't silently widen a range you already narrowed on purpose.
  Known limitation of building a dual slider this way without a library:
  only *dragging* a handle moves it — clicking elsewhere on the track
  doesn't jump the nearest handle to that point, the way a fancier
  slider might. The two numbers below the track are the other way to set
  it — click/tap one to type an exact amount instead, the same
  `InlineEditable` click-to-edit interaction (and the same dotted
  underline) as editing an item's name or price on a bill. A typed value
  clamps the same way dragging does: it can't cross the other handle's
  current value or leave the slider's own bounds.

Filtering happens entirely client-side against data already loaded for
the page — `loadBills()` now also pulls each bill's `items(total_price,
category_id)` (lightweight; just what tag/price filtering needs), so
typing in the search box or dragging a slider handle never fires its own
round-trip.

## Bill actions: deleting and sharing

Every bill in the group's list has a **⋮** button on its right edge —
a small popover with **Select**, **Share**, and **Delete** for that one
bill (`src/components/BillActionsMenu.jsx`). **Delete** asks a plain
`window.confirm()` and removes just that bill; undoing a single accidental
click is cheap enough not to need more than that. **Select** doesn't
present a checkbox itself — there isn't one until selection mode is
actually on — it turns selection mode on and ticks that one bill, landing
in exactly the state you'd be in if you'd tapped the list's own **Select**
toggle above it and then checked that row by hand. Both entry points feed
the same selection state, so there's no real duplication: the toggle is
faster when you're starting from "pick a bunch," the menu's Select is
faster when you're starting from "actually, let's also grab this one."

With one or more bills selected, a bar above the list shows a running
count plus two actions:

- **Share** — fetches the selected bills' full items and payer splits and
  shares them as one message via the phone's native share sheet (falling
  back to clipboard on desktop), same `shareOrCopyText` used for recaps and
  invites elsewhere. A single bill shares identically to opening that bill
  and sharing its own recap; more than one gets a `*N bills*` header, each
  bill's own recap in order, and a grand total at the end
  (`formatMultiBillRecap()` in `src/lib/recapText.js`). Text only for
  now — no PDF option for a multi-bill share, since that would need its own
  printable multi-bill layout rather than reusing the single-bill print
  path each bill's own page already has.
- **Delete selected** — a plain `window.confirm()` naming the count, then
  removes them all in one go. Selection persists across pages of the list
  (it's a plain `Set` of bill IDs, independent of which page is currently
  rendered), so picking a few bills, paging over, and picking a few more
  before deleting or sharing them all together works as expected.
  **Cancel** (or finishing an action) clears the selection and drops back
  to the normal list. Selecting literally every bill currently in the
  group and hitting **Delete selected** is treated as the same "delete
  everything" action as the Danger Zone button below — see there for what
  that means.

For clearing out a group's **entire** history in one shot (starting over,
or undoing a bulk import gone wrong) rather than selecting hundreds of rows
by hand, Group Settings' **Danger zone** has a **Delete all bills** button.
This is the one bill-deleting action in the app that's admin-gated — every
other delete path above (one bill, several, even accidentally selecting
every bill and hitting Delete selected) stays open to any active member,
same as it's always been; only *this specific* "wipe the group's entire
bill history in one action" is admin-only, enforced server-side by a
`delete_all_group_bills(target_group_id, delete_payments)` RPC
(`security definer`, checks `groups.admin_id` itself — see
`supabase/schema.sql`) rather than left to the general `bills` policy, so a
non-admin can't just call the same delete directly and skip the UI. The
confirmation dialog also asks a genuine either/or, not just click-to-agree:
a checkbox for whether to **also delete every settle-up (payment) record**
in the group, since normally payments are left alone by every delete path
(see below) but "starting over completely" is a real, different intent
from "just clear the bills." Because this one action can erase everything
a group has ever recorded, it doesn't take a plain confirm dialog either:
`TypedConfirmModal` (`src/components/TypedConfirmModal.jsx`) requires
typing the group's exact name before the confirm button even enables, on
the theory that a click is reversible-feeling in a way that typing the
group's name deliberately isn't. It's a small generic component — any
other action this destructive can reuse it rather than rolling its own
typed-confirmation flow.

All delete paths ultimately remove rows from `bills`, relying on `items`,
`item_shares`, and `bill_payers` all being `on delete cascade` from
`bills.id` — nothing bespoke needed for items to disappear along with the
bill that owns them. **Payment (settle-up) records are left alone by every
delete path except "delete all bills," and even there only if its checkbox
was ticked** — normally they're a separate ledger of cash that's already
changed hands between two people, not data that belongs to any particular
bill, so wiping some or all of a group's bills doesn't touch its settle-up
history unless that was explicitly asked for.

## Your groups: layout and card style

The landing page (`src/pages/Groups.jsx`) is deliberately "list first" —
**Create a new group** lives in its own section *below* the group list,
not above it, so the list itself is the first thing you see and the
create-a-group form doesn't sit between you and a group you're trying to
open. Same reasoning, and the same divider treatment, as every other
"section below other content" on this page's siblings. The list itself
paginates at 10 groups a page (`src/components/Pagination.jsx`, the same
component the bill list already uses, just a smaller page size), rather
than growing without bound as you join more groups.

Both the groups list and every group's own bill list share one card
style (`.card-list-item`), which now sits on a new `--surface-tint` token
instead of plain `--surface` — a faint tint of the app's own accent
green (not a generic gray), so a row reads as a distinct surface against
the page background purely from its own color, not only from its border.
`--surface` itself is untouched (modals, popovers, and everything else
that isn't a list row look exactly as before) — this is scoped
specifically to `.card-list-item`, the one shared style behind both
lists.

## Inviting people

The **Invite** button on a group's page opens a QR code (for someone
standing right next to you) plus a **Share invite link** option, which uses
`src/lib/shareText.js` — the same native-share-with-clipboard-fallback logic
already used for recaps, rather than a separate copy-only implementation.
The QR code itself is generated client-side (the `qrcode` package, lazy
imported so it's never fetched by anyone who doesn't open the invite menu)
— no third-party image service involved, consistent with everything else
in this app never depending on an external call for something this core.

## The in-app guide

`/guide` (also reachable from the account menu as "How to use") is a
searchable set of collapsible sections covering the whole app, aimed at
anyone joining a group who didn't build it and doesn't know which parts are
obvious and which aren't. Worth keeping in sync as features are added — it's
a single page, `src/pages/Guide.jsx`, and each section is self-contained.

## Recaps, PDFs, and CSV

Every bill and every group's settle-up has a single **Share recap** button
(`src/components/ShareButton.jsx`) — clicking it opens a small menu with
the two ways to get the recap out, rather than two separate buttons sitting
side by side:

- **Share as text** — plain text via the phone's native share sheet
  (straight into WhatsApp, Messages, wherever), falling back to
  copy-to-clipboard on desktop. `src/lib/recapText.js` builds the text; it
  leans on WhatsApp's own `*bold*`/`_italic_` formatting rather than
  markdown, since markdown wouldn't render there at all.
- **Download as PDF** — uses the browser's own print dialog rather than a
  new dependency: a `.print-only` element (see `PrintableRecap.jsx` and the
  `@media print` rules in `styles.css`) stays hidden on screen and is the
  only thing visible when `window.print()` is called, so "Save as PDF" in
  the print dialog produces a clean recap with none of the app's own UI in
  it. `ShareButton` itself has no idea which printable recap actually
  exists on the page — it just triggers the print dialog, same as before.

A bill also gets a separate, always-visible **Export CSV** button (one row
per item, via `src/lib/csv.js`) next to the share menu, divided from it by
a thin vertical rule (`.recap-divider` in `styles.css`) rather than another
menu option — it's a fundamentally different kind of export (structured
data, not a human-readable recap), so folding it into the same menu would
have blurred that distinction.

The group page's settle-up recap gets the same treatment: an **Export CSV**
button next to its own share menu, same divider style, exporting the whole
group's bill history rather than one bill's items — `buildGroupCsvRows()` in
`src/lib/csv.js` walks every bill in the group (oldest first) and emits one
row per item, with `Date`, `Bill`, `Item`, `Quantity`, `Unit Price`,
`Total Price`, `Category`, `Paid By`, and `Split With` columns. Category
resolution matches the stats page exactly (an item's own category, else its
bill's, else "Uncategorized"), `Paid By` lists every payer with their amount
for multi-payer bills, and dates are the bill's local calendar day in
`YYYY-MM-DD` form — sortable and locale-unambiguous, since this file is
meant to be read back into a spreadsheet rather than displayed. It's the
full history, not scoped to whatever period Your Stats happens to be showing;
a group's CSV export is a one-off backup/analysis action, not a filtered view.

### Importing from Splitwise

`/groups/:groupId/import` reads a Splitwise CSV export directly (from
*Splitwise's* own Group settings → Export as CSV, not this app's). The
link to this page lives in this app's own **Group settings**, not the
group page itself — realistically a one-time thing per group, so it
doesn't need to stay one tap away from the bill list forever. Splitwise's
export format is `Date,
Description, Category, Cost, Currency`, then one column per group member
holding their **net balance** for that expense (positive = they're owed,
negative = they owe) — not a raw share amount. `src/lib/splitwiseImport.js`
reconstructs who paid (whoever has the largest positive net) and each
person's actual share (`cost - theirNet` for the payer, `-theirNet` for
everyone else) from that, dated to match the original expense — that date
is what the bill list's own date dividers group it under (see [How the
data model works](#how-the-data-model-works)), so an import lands exactly
where it belongs in the timeline without anything special needed here for
that.

Splitwise doesn't track individual line items the way this app does, but
an imported expense isn't a single item covering the whole cost either —
each person's own reconstructed share becomes its own item, assigned just
to them (`unit_price`/`total_price` both that exact amount, one
`item_shares` row at weight 1). That's the same shape a hand-entered
"everyone bought their own thing" bill already has in this app: every
`item_shares` row anywhere is always an equal weight of 1 per buyer — an
*uneven* split, imported or not, always comes from separate items, never
from weighting shares within one (see the `item_shares` row in [How the
data model works](#how-the-data-model-works)). Splitting it this way
rather than one big item means an imported bill is exactly as editable
afterward as any other — rename an item, reassign it, adjust its price —
instead of needing a weighted-shares concept that exists nowhere else in
the app.

Before importing, you're asked to match each name Splitwise exported
against an existing member of the group (real or guest) or create a new
guest for them — names that already match exactly are pre-selected
automatically.

**When Splitwise's net balances alone aren't enough.** Reconstructing "who
paid, and each person's share" from net balances only works when exactly
one person on a row has a positive net — the overwhelming majority of
rows. Two situations can't be resolved that way at all, and there's no
way to tell them apart or guess correctly from the numbers alone:

- **Nobody has a positive net.** A personal expense someone logged purely
  for their own tracking — they paid it and it was entirely their own
  share, so their net comes out to exactly 0, indistinguishable in the
  numbers from "not involved at all."
- **More than one person has a positive net.** A real multiple-payer
  expense, but Splitwise's export only ever gives each person's net
  balance, never how much each of several payers actually contributed —
  that specific number simply isn't in the file to recover.

Both kinds are collected during parsing (`needsReview` in
`parseSplitwiseCsv()`) instead of being silently skipped or guessed at,
and handled by a review step that appears after matching people, only if
anything needs it — one expense at a time, wizard-style, the same feel as
the people-matching step itself. For each: pick who paid (a plain dropdown
for the common single-payer case, with a "Multiple payers…" option that
opens the same amount-entry modal a bill's own page uses) and who it's
split with — checkboxes, defaulting to an even split of the cost among
whoever's checked (`splitEvenly()` in `src/lib/splitEvenly.js`, cent-exact
rather than plain division, so an odd number of cents left over from a
3-way split doesn't silently go missing), with a "Split unevenly…" option
right there for when it isn't — the *same* amount-entry modal reused a
second time, just for who's consuming the bill instead of who fronted it,
since it's genuinely the same shape either way: pick some people, assign
each an amount, the amounts must sum to the total. "Skip for now" imports
the bill with no payer set rather than forcing a decision on the spot;
either way, the bill's note gets a
permanent, searchable tag (`Splitwise import: reviewed manually` or
`Splitwise import: needs review — payer not set`) so it's findable again
through the group's own bill search long after this one import session
ends.

**Proof-checking the result.** Splitwise's own export ends with a trailing
"Total balance" row — not a real expense, but the one place the file
states each person's own all-time net balance directly. `parseSplitwiseCsv()`
captures it (`finalBalances`) instead of just skipping it as a non-expense
row, and once the import finishes, `checkImportBalances()` runs the app's
own `computeBalances()` (the exact same settlement math the group page
itself trusts) over everything just imported *plus* the group's existing
payments — any settle-up already recorded before this import — and
compares each person's reconstructed balance against Splitwise's own
number for them, a few cents' tolerance absorbing any rounding drift
accumulated across hundreds of reconstructed shares. Existing payments
matter here even though Splitwise's own number has no notion of them:
the live Settle Up page always includes every payment in the group, so a
check that only looked at the freshly imported bills could report a clean
match here and then visibly disagree with that page the moment you look
at it — most confusingly after deleting a group's bills without also
checking "delete payments too" and re-importing into the same,
no-longer-quite-empty group. A green confirmation means the two
independently arrive at the same picture; a red one lists exactly whose
balance doesn't match and by how much — informational either way, never a
hard stop. "Continue anyway" is always right there, same reasoning as
everywhere else this app avoids trapping you behind a check it runs on
your behalf: you're the authority on your own financial history, not a
validation rule.

## How the data model works

| Table          | What it's for                                                   |
|----------------|-------------------------------------------------------------------|
| `profiles`     | Display name per user, auto-created on signup                    |
| `groups`       | A household / trip / friend circle, with a shareable invite code and an `admin_id` (a `group_members.id`) |
| `group_members`| Every *participant* a group can have — a real account (`user_id` set, name from `profiles`) or a guest with no account at all (`user_id` null, `display_name` set directly). `active=false` means they've left/been removed/archived — kept, not deleted. |
| `bills`        | One receipt/expense event. `paid_by` (a `group_members.id`) covers the common single-payer case; an optional `default_buyer_ids` controls who *new* items on this bill split with by default; `category_id` is the bill's default spending category |
| `bill_payers`  | Only has rows once a bill's been switched to "multiple payers" — one row per payer with their own contributed amount. When present, this is the source of truth for who fronted the bill and `paid_by` is cleared |
| `items`        | One line item on a bill; `category_id` optionally overrides the bill's category for just this one item |
| `item_shares`  | Who's responsible for how much of each item (`member_id` is a `group_members.id`; `shares` = weight, so someone taking 2 of 3 units owes double) |
| `payments`     | A recorded cash transfer between two participants (`from_member`/`to_member`, both `group_members.id`) |
| `categories`   | A group's own list of spending categories, seeded with a starter set on group creation, freely editable afterward |
| `recurring_bills` | A template for a repeating bill (rent, a subscription) — fixed amount, single payer, fixed split, plus a frequency and the next date it's due. Each occurrence created from it is a normal row in `bills`, linked back via `bills.recurring_bill_id` |
| `departure_snapshots` | A frozen personal record of a *real account's* paid/consumed totals in a group they've left, day-by-day (each day's consumed portion also broken down by category), plus their balance at that moment — see below |
| `spending_thresholds` | A profile-level (not group-level) monthly budget per category *name* — see [Spending thresholds](#spending-thresholds) |

The bill list on a group's page is grouped under date dividers — a month
header ("August 2026") for each month present, and inside it a day
sub-header (just the day number, "20") for each day within that month —
styled after how Splitwise groups its own activity feed. `groupItemsByDate()`
(`src/lib/dateGroups.js`) is the plain, pure function behind it: it walks
an already-sorted list once and starts a new month/day group whenever the
calendar month/day actually changes, rather than resorting anything itself
— the bill list's own `created_at` descending order is what the group page
already fetches, so newest-month-first and newest-day-first fall out of
that for free. It groups within whatever's on the current page of results,
same as before date dividers existed — a day's bills can in principle
still be split across two pages of the (paginated) list, showing that day's
header again at the top of the next page, which is a reasonable tradeoff
against re-fetching everything just to group first and paginate second.

Settlement math lives entirely in `src/lib/settlement.js` — it's plain,
readable JS with no dependencies, worth a read. It's worth noting that it
operates on whatever ID it's handed with zero special-casing — it's never
needed to know whether an ID belongs to a real account or a guest.

### Guests

Anyone can be added to a group without ever making an account — useful any
time only some of the people splitting a bill actually want the app.
`group_members` is the one place this lives: a guest is a row with no
`user_id`, just a `display_name`, added by any active real member from
Group Settings. Every other table that references "a person" —
`bills.paid_by`, `item_shares.member_id`, `payments.from_member`/
`to_member` — points at `group_members.id`, so a guest can be assigned to
items, front a bill, or owe/be owed money exactly like a real account,
using the exact same settlement math.

Removing a guest is just flipping `active` to `false` directly — unlike a
real account leaving, there's no login-gated access to protect, so no
snapshot is involved, and they can be restored any time from Group
Settings.

**Deleting one permanently** is a separate, further step from Archived
guests — the group admin only, and only once that guest is off every
bill, payment, and recurring template in the group; otherwise it's
rejected outright rather than left half-broken. That check is enforced
server-side (`delete_guest_permanently()`, `supabase/schema.sql`), not
just in the UI, and for a real reason beyond "trust the client": most of
`group_members.id`'s references — `bills.paid_by`, `bill_payers`,
`payments` — are plain foreign keys, so a raw delete against a guest
still on one of those would simply fail. `item_shares.member_id` isn't
plain, though; it's declared `on delete cascade` so that deleting an
*item* cleans up its own shares, and that same cascade would just as
happily fire for deleting the *person* — silently dropping their share
off of someone else's item and quietly inflating what everyone else on
it owes, no error, just a wrong number the next time anyone looks.
Checking every table by hand rather than leaning on whichever ones
happen to have a blocking FK is what makes this actually safe. The
confirm step itself asks you to type the guest's own name, the same
"deliberately slower than a plain confirm" pattern Danger Zone's own
"Delete all bills" uses for the same reason: this one can't be walked
back either.

The `user_id` column being nullable, rather than a guest being a
fundamentally different kind of row, is deliberate: it leaves room for a
future "claim this profile" flow, where a guest who decides to actually
sign up would just have their existing row gain a `user_id`, rather than
needing their history relinked from a separate identity.

### Claiming a guest profile

That "future flow" from the paragraph above now exists. From Group
Settings, "Get claim link" next to a guest generates a one-time link
(`group_members.claim_token`) and shares it — deliberately sent directly
to that one person, not posted anywhere the whole group can see, since
possessing the link is what authorizes claiming that specific identity.
Opening it (`/claim/:token`) shows who and which group before committing to
anything (`get_claim_preview()`, a SECURITY DEFINER function, since the
normal `group_members` SELECT policy requires prior membership that a
brand-new claimant doesn't have yet); confirming calls
`claim_guest_profile()`, which attaches the caller's `user_id` to that
existing row and clears the token so the link can't be reused. Every bill,
item, and payment that guest was ever part of is now simply theirs — there
was never a separate identity to migrate data *from*.

### Multiple payers

A bill's "Paid by" is usually one person, but picking "Multiple payers…"
opens a small modal where any number of people can be checked off with
their own individual contributed amount next to them. Nothing is saved
until the entered amounts add up to *exactly* the bill's current total —
until then Confirm stays disabled and a red message explains why.
Canceling out of the modal (including clicking outside it) discards
whatever was being typed and leaves the last confirmed split untouched;
nothing about the bill's actual items is ever affected by this.

If a bill's items change *after* a split was confirmed (a new item added,
changing the total), the now-mismatched split is flagged with a persistent
warning right on the bill page — not just inside the modal — until it's
corrected. The bill keeps working in the meantime; nothing is deleted or
blocked.

Under the hood, `bill_payers` only has rows once a bill's actually been
switched to multiple payers — the common single-payer case still just uses
`bills.paid_by`, completely unchanged. `settlement.js`'s three core
functions all funnel through one small `creditPayers()` helper that reads
whichever is present, so nothing about the balance math needed to
special-case single vs. multiple payers beyond that one place.

### Admin permissions

Each group has exactly one admin (`groups.admin_id`), starting with
whoever created it. Only the admin can remove someone *else* from the
group — anyone can still remove themselves (leave) regardless. Both rules
are enforced inside `remove_group_member()` itself, not just hidden behind
a UI button, so they hold even against a raw API call.

If the admin leaves, the role automatically passes to whoever's been in
the group the longest among the remaining active real members
(`join_group_by_code` order by `joined_at`) — a group is never left without
an admin as long as a real member remains in it. The current admin can also
hand the role to anyone else directly, via `transfer_admin()`, from Group
Settings.

Guest management (add/rename/archive/restore) is deliberately **not**
admin-gated — any active member can manage guests, the same as adding a
bill. The restriction is specifically about removing a *real person*
against their will, not about editing shared group data.

### Leaving a group and personal stats

Removing a *real account* from a group (or leaving one yourself) doesn't
delete anything — it flips `group_members.active` to `false`, which is what
every RLS policy checks to decide access going forward. That person's old
bills, items, and payments stay exactly as they were; they just lose the
ability to query that group's live data again.

To keep their personal "Your stats" page accurate anyway, the *client*
computes a `departure_snapshots` row for them *at the moment of removal* —
while they still have access — via `computeDailyTotalsForUser()`
(`src/lib/settlement.js`), then passes it to `remove_group_member()` to
store. It's their own paid/consumed totals bucketed by calendar day (each
day's consumed portion also broken down by category name, resolved the
same way `computeMyCategorySpend()` resolves one — an item's own category,
falling back to its bill's, falling back to "Uncategorized"), plus their
balance right then. Day-level buckets are what let "by week / month /
year" views stay exactly correct for a departed group forever, without
needing to keep querying it: any coarser period is just the right days
summed together, no approximation — `sumDailyInRange()` and
`sumCategoryDailyInRange()` (`src/lib/timeRange.js`) do exactly that
reconstruction for the plain totals and the category breakdown
respectively. If they rejoin later, live data (which was never touched)
naturally covers everything again, snapshot included, and the account
stats page prefers live data whenever it's available.

Category tracking was added to `daily_totals` after this feature already
shipped — no migration was needed for that (the column was always a
flexible `jsonb`), but it does mean a snapshot recorded before that point
has no category breakdown for its days, only the original paid/consumed
figures. There's no way to backfill one after the fact: the person who
left has already lost read access to that group's underlying bills by
design (that's the whole point of the snapshot), so the data the
breakdown would need is gone from their side. `mergeCategorySpend()`
just quietly adds nothing for that gap rather than erroring — the total
still counts, it's just not attributed to a category.

## Roadmap

Roughly in the order they're likely to land, though nothing here is
promised on any particular timeline — this is a personal project, built as
time and interest allow.

- Moving the settlement/category-totals math into a Postgres function
  instead of shipping every item/share row to the browser for
  `computeSpendingTotals`/`computeCategoryTotals` to sum client-side — held
  in reserve, only worth doing if everything else already in place (the
  per-page cache, parallel fetching, the recent-window-then-backfill split
  on stats pages, GroupView's unified bill fetch) turns out not to be
  enough on a genuinely large group. The most scalable fix long-term, but a
  real lift (a new migration, a SECURITY DEFINER function, RLS to think
  through), not something to start speculatively
- Group-level (or shared) spending thresholds, as a variant alongside the
  personal ones that exist today — very low priority; nothing about
  `spending_thresholds` being keyed by `user_id` rules this out later, it's
  just not built
- AI-assisted category suggestions during a scan, since the vision models
  are already looking at the receipt image
- Push notifications, once the app is used consistently enough for that to
  make sense rather than adding noise
- Item price tracking across visits ("has milk gotten more expensive at
  this store") — flagged early as a long-standing goal, genuinely harder
  than it sounds since item names from a scan aren't perfectly consistent
  between visits, so matching "the same item" over time is a real
  fuzzy-matching problem, not a lookup
- True multi-currency support (conversion between currencies within a
  single bill or group), as distinct from the display-only currency picker
  that exists today — low priority; the display picker covers the common
  case of "I'd rather see $ than €" without the complexity of real exchange
  rates
- A scheduled/background job for recurring bills (see below) rather than
  the current opportunistic, open-the-app-to-trigger-it approach — only
  worth the added infrastructure if the current tradeoff ever actually
  becomes a problem in practice

## What's intentionally left simple (v1)

- No UI yet for "I only had half a portion" style partial weights — the
  `shares` column already supports fractional/unequal shares, just needs a
  stepper control in `ItemRow` instead of a plain checkbox
- No push notifications when a group-mate adds a bill (realtime *within* the
  open app works today; background notifications would need a service worker
  + web push setup — see [Roadmap](#roadmap))
- No receipt photo is kept after scanning — only the extracted items are
  saved. Add a Supabase Storage upload in `ScanReceiptButton.jsx` if you'd
  like to keep the originals.
- Deleting a whole group isn't wired up in the UI yet — bills, payment
  records, and individual members can all be removed, the group itself can't
  be deleted yet.
- A departure snapshot's balance *and* its day-by-day/category breakdown
  are all trusted from the client rather than re-derived in SQL (see the
  comment above `remove_group_member` in `schema.sql`) — reasonable for a
  personal-use app since it's a display-only historical record, not the
  source of truth for any live balance, but worth knowing if this ever
  needs to hold up to less trusted users.
- The free OCR fallback expects an item's name and price to sit on the same
  line; a receipt that wraps a long item name onto its own line above the
  price won't parse correctly for that item. This is the honest tradeoff of
  "no per-store templates, ever" — it degrades gracefully rather than
  guessing wrong, but it does mean occasionally missing a line entirely.
- OpenAI and other providers aren't built yet, but would follow the exact
  same `ReceiptParserStrategy` shape as the four that already exist.
- A recurring bill template covers a single payer and a fixed set of
  people — no multi-payer templates. If a recurring expense genuinely needs
  multiple payers, switch that specific generated occurrence to Multiple
  payers by hand afterward; the template itself stays simple.
- Recurring bills generate on open, not on a schedule — see
  [Recurring bills](#recurring-bills) for the full reasoning. In practice
  this means a bill can appear "late" (whenever someone next opens the
  group) rather than exactly on its due date.
- The claim-guest-profile flow has one intentionally loose edge: possessing
  the link is what authorizes claiming, the same trust model the general
  group invite link already uses — there's no additional verification that
  the person opening it is actually who they claim to be. Reasonable given
  it's meant to be sent directly and privately, not posted publicly.
- PDF export goes through the browser's print dialog rather than a
  one-tap download — deliberate, to avoid a new dependency, but it is an
  extra step compared to Share recap.
- `groups.admin_id` changes are only supposed to happen through
  `transfer_admin()`, but the general "members can rename their group" RLS
  policy is a blanket per-row check, not a per-column one — so it can't
  actually stop a determined client from changing `admin_id` directly via a
  raw API call, only the app's own code never does. Reasonable for a
  personal-use app; would need tightening (a trigger, most likely) before
  this held up against untrusted users.
- Spending thresholds only cover the current calendar month — no
  weekly/yearly option, and no way to see a past month's budget vs. actual
  after the fact. Matches the one case the feature was actually built for;
  a period selector would be a real chunk of extra UI for a need that
  hasn't shown up yet.
- A departed group's frozen spending counts toward a spending threshold —
  `departure_snapshots` keeps a category breakdown per day, not just plain
  paid/consumed totals (see [Leaving a group and personal
  stats](#leaving-a-group-and-personal-stats)) — with one honest gap: a
  snapshot recorded *before* that breakdown existed has nothing to
  attribute to a category for its days, only the original two numbers.
  There's no way to backfill it after the fact, since the person who left
  has already lost read access to that group's data by design.
- The budget indicator only shows on Your Stats (`/stats`), not on any
  single group's own stats page — a personal threshold is inherently a
  cross-group number, and showing "this group's contribution toward your
  overall budget" on a single-group page would need that page to fetch
  every other group's data too, for a number that's arguably confusing to
  see partial.
- Merging same-named categories across groups is trim + case-insensitive,
  but only at the moment a threshold is saved or displayed — if a
  category's exact casing changes in some other group *after* you've set a
  threshold for it (rare: someone else renaming "Wine" to "wine" in a
  different group), the merge can silently split into two entries next
  time you save one of them, leaving a harmless orphaned row behind in
  `spending_thresholds` under the old casing. Re-saving the threshold once
  it's showing under the new casing is the fix; nothing is lost, just
  briefly split.
- Category totals aren't reflected in recap text, PDFs, or CSV export yet
  — those all still just show items and prices. Easy to add if it turns
  out to matter; skipped here to keep that pass focused.
- No AI-assisted categorization yet (see [Roadmap](#roadmap)) — the
  scanning strategies don't suggest a category for what they've just read,
  even though they're already looking at the image.

## Security notes

- Every table has row-level security scoped to "members of the same group" —
  see the policies at the bottom of `schema.sql`.
- Each person's Gemini/Claude API key (if they choose to use one) lives only
  in their own browser's local storage, entered once in Scan settings — it's
  sent directly from their browser to that provider, never through
  Supabase, and never shared with anyone else in the group. The older
  server-side Edge Function that used one shared, hardcoded key still
  exists in the repo but isn't wired up to anything by default (see
  [Receipt scanning](#receipt-scanning)).
- Group names and invite codes are only visible to members; joining a new
  group goes through the `join_group_by_code()` Postgres function so the
  `groups` table itself doesn't need to be publicly readable.
