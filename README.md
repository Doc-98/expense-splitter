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
- [Currency](#currency)
- [Categories](#categories)
- [Spending thresholds](#spending-thresholds)
- [Period-over-period comparison](#period-over-period-comparison)
- [Time period controls](#time-period-controls)
- [Recurring bills](#recurring-bills)
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
- **A default period on Your Stats** — the page opens on whatever
  granularity is set as your default (out of the box, "Month"), always
  with the current one selected, never a specific frozen point in time.
  Change it any time: browse to a different tab and a small "Set \_\_\_ as
  default" link appears beneath the tabs; your saved default itself is
  always shown with a thin outline around its tab — separate from which
  tab is *active* right now, since you can be looking at Year while Month
  stays your saved default. Group Stats doesn't have this (there's no
  single "default" that makes sense per-group the way there is for your
  own cross-group view), so its own `TimeRangeSelector` simply doesn't
  pass the two props (`defaultGranularity`, `onSetDefault`) that turn the
  feature on — the component itself degrades cleanly to its old behavior
  when they're omitted.
- **Where "Spending thresholds" sits on Your Stats** — pinned to either the
  very top of the page (above the period selector) or the very bottom
  (after everything else), never in between, since thresholds are always
  this-month regardless of the selector while every other section on the
  page moves with it — sitting in the middle read as confusing once
  thresholds existed alongside a period selector. Since there's no
  obviously-correct choice, it's a per-device preference toggled from a
  link right in that section ("Show at top/bottom instead"), not a fixed
  decision.

Both preferences above (default granularity, thresholds position) live in
`localStorage` (`src/lib/statsPreferences.js`), the same per-device-only
mechanism already used for currency and dark/light mode — they won't
follow you to a different phone or browser.

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
everyone else) from that. Since Splitwise doesn't track individual line
items the way this app does, each imported expense becomes one bill with a
single item covering the whole cost, dated to match the original expense —
that date is what the bill list's own date dividers group it under (see
[How the data model works](#how-the-data-model-works)), so an import lands
exactly where it belongs in the timeline without anything special needed
here for that.

Before importing, you're asked to match each name Splitwise exported
against an existing member of the group (real or guest) or create a new
guest for them — names that already match exactly are pre-selected
automatically.

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
time and interest allow. Nothing currently sits in an "up next" tier — both
items that were there (spending thresholds, period-over-period comparison
on Your Stats) have shipped.

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
- Splitwise import still credits a single payer per expense (whoever has
  the largest positive net balance) — this is a genuine limitation of
  Splitwise's own export format, not something parsing harder could fix:
  it only ever exports each person's *net balance* per expense, never each
  payer's individually contributed amount, so multiple payers' exact
  amounts aren't recoverable from the file at all. When a row shows signs
  of having had more than one payer, it's now flagged with a warning
  naming the specific expense — go fix that one bill's "Paid by" by hand
  afterward, now that the app itself supports multiple payers. A row
  where literally everyone's net balance is zero (no sharing happened at
  all) is skipped with a warning rather than guessed at.
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
