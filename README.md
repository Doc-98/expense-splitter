# Spesa — Expense Splitter (PWA)

A phone-installable rebuild of an old JavaFX receipt splitter. Snap a photo of
a receipt (or type items in by hand), assign who's buying what, and see a
live, real-time settle-up with everyone in your group — no app store
required.

**What it does:**

- 📸 Scan a receipt (free on-device OCR, or your own Gemini/Claude/Ollama
  key) or add items by hand, with live settle-up as you go
- 👥 Split a bill across anyone, including guests with no account at all
- 💳 Front a bill with more than one payer, each with their own amount
- 🏷️ Tag bills and items by category — see not just how much you spend, but
  on what — and set a personal monthly budget per category
- 📤 Share a recap as text, PDF, or CSV — or import your history from
  Splitwise
- 📈 Track your own stats across every group you're in, even ones you've left

Nothing here is deployed for you — this is real, runnable source code you
deploy to your own free Supabase + Vercel account, so *you* own the data and
the (tiny) hosting bill. Setup takes about 20 minutes.

> **Looking for deeper implementation detail than this file carries?** This
> README is deliberately a quick, practical read — architecture notes, edge
> cases, and design rationale are trimmed to what's needed to use or extend
> the app, with longer detail tucked behind `<details>` toggles below rather
> than left out entirely. A fuller reference site (mkdocs) is a likely future
> home for the rest.

## Contents

- [How it's built](#how-its-built)
- [Setup](#setup)
- [Receipt scanning](#receipt-scanning)
- [Editing items](#editing-items)
- [Backdating a bill](#backdating-or-postdating-a-bill)
- [Settings page](#settings-page)
- [Currency](#currency)
- [Categories](#categories)
- [Spending thresholds](#spending-thresholds)
- [Period-over-period comparison](#period-over-period-comparison)
- [Time period controls](#time-period-controls)
- [Spending graphs](#spending-graphs)
- [Keyboard navigation](#keyboard-navigation)
- [Recurring bills](#recurring-bills)
- [What a bill row shows](#what-a-bill-row-shows)
- [Searching and filtering bills](#searching-and-filtering-bills)
- [Bill actions: deleting and sharing](#bill-actions-deleting-and-sharing)
- [Your groups & inviting people](#your-groups--inviting-people)
- [Personal spending](#personal-spending)
- [The in-app guide](#the-in-app-guide)
- [Recaps, PDFs, and CSV](#recaps-pdfs-and-csv)
- [How the data model works](#how-the-data-model-works)
- [Roadmap](#roadmap)
- [What's intentionally left simple (v1)](#whats-intentionally-left-simple-v1)
- [Security notes](#security-notes)

## How it's built

- **Frontend**: React + Vite, packaged as an installable PWA (`vite-plugin-pwa`)
- **Backend**: [Supabase](https://supabase.com) — Postgres, auth, realtime
  sync, free tier to start
- **Receipt scanning**: no server, no shared API key, no per-store parsing
  code required by default — see [Receipt scanning](#receipt-scanning)
- **Settlement**: `src/lib/settlement.js` computes net balances per person
  and simplifies them into the minimum number of payments to settle up

## Setup

> **Upgrading an install from before guests/multi-payer support?** That
> version restructured how `bills`/`items`/`payments` reference people (a
> new `group_members.id` instead of a raw account id) — there's no migration
> path from it; see [Resetting the database](#resetting-the-database) below.
> Every feature since then ships as a plain additive migration, no reset
> needed.

### 1. Create your Supabase project

1. [supabase.com](https://supabase.com) → New project (free tier is fine).
2. **SQL Editor** → New query → paste in the entire contents of
   [`supabase/schema.sql`](supabase/schema.sql) → run. Creates every table,
   security policy, and the profile-creation trigger.
3. **Database → Replication → supabase_realtime** → enable for `bills`,
   `items`, `item_shares`, `bill_payers`, `payments`, `group_members` — this
   is what makes edits show up live on every phone without refreshing.
4. **Authentication → Sign In / Providers** → confirm **Email** is on
   (default). For magic links and password-reset links to redirect to your
   deployed app instead of `localhost`, set **Authentication → URL
   Configuration → Site URL** once you've deployed (step 3 below), and add
   `your-deployed-url/reset-password` under **Redirect URLs** on the same
   page — Supabase rejects a redirect target that isn't on this allowlist,
   which otherwise silently breaks the "forgot password" flow specifically
   (magic links happen to redirect to the Site URL's bare root, which is
   already allowed by default; password resets redirect to `/reset-password`
   on top of it, which isn't covered by that same default).

### 2. Get your API credentials

**Settings → API** → copy **Project URL** and **anon/public key** (safe to
expose in frontend code — every table is locked down by `schema.sql`'s RLS
policies, not by hiding this key). Copy `.env.example` to `.env`:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

### 3. Run it / deploy it

```bash
npm install
npm run dev
```

Deploy to [Vercel](https://vercel.com) or [Netlify](https://netlify.com)
(both free): push to a GitHub repo → import it → build command `npm run
build`, output dir `dist` → add the two `VITE_SUPABASE_*` env vars in the
host's dashboard → deploy → paste the resulting URL into Supabase's **Site
URL** setting so magic links redirect correctly.

### 4. Install it on a phone

- **iOS Safari**: Share button → *Add to Home Screen*
- **Android Chrome**: menu (⋮) → *Install app* (or it'll prompt automatically)

It now behaves like a native app icon — full screen, no browser bar.

### Resetting the database

Only relevant to the guest/multi-payer schema change flagged above — skip
this on a fresh project, or when picking up a routine feature update (those
are plain additive migrations; see each one's file under
`supabase/migrations/`). Run this in the SQL Editor, then run the entire
`schema.sql` file again. Only removes this project's own tables/functions —
never touches the `public` schema itself or Supabase's default permissions
on it.

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

Doesn't delete anyone's actual login (`auth.users` is untouched) — create a
fresh group and have everyone rejoin via a new invite link afterward.

## Receipt scanning

Every strategy runs entirely in the browser — nothing server-side to deploy.
Chosen per-person in **Settings → Scan settings**, stored only on that
device.

| Strategy | Setup | Notes |
|---|---|---|
| **Free OCR** (default) | None | Runs on-device (Tesseract.js). Best on a clear, well-lit, two-column receipt (item left, price right). |
| **Google Gemini** | Your own key ([aistudio.google.com](https://aistudio.google.com/app/apikey), free tier) | More accurate on messy or unusual receipts. |
| **Anthropic Claude** | Your own key ([console.anthropic.com](https://console.anthropic.com)) | Not a free tier, but well under a cent per scan. |
| **Local Ollama** | A vision model already pulled (`ollama pull qwen2.5vl`) | Fully private — nothing leaves your network. ⚠️ Set `OLLAMA_ORIGINS` (to this app's address, or `*`) and restart Ollama, or every scan fails with a network error even though Ollama is running fine. |

All three model-backed strategies also suggest each item's category (only
from the group's own existing list — never inventing one, and `null` when
unsure) and merge an obvious discount into the item it belongs to. Free OCR
keeps a discount as its own line instead, since a rule-based parser can't
safely tell which item it applies to.

<details>
<summary>Implementation details, and adding a new provider</summary>

Free OCR: `src/lib/receipt-parsing/imagePreprocess.js` grayscales and
binarizes the photo using a local, per-region contrast threshold (handles an
unevenly-lit phone photo better than one global cutoff) before Tesseract
runs; `lineParser.js` then pairs recognized words into item/price lines by
their position on the page.

All three cloud/local strategies share one prompt
(`src/lib/receipt-parsing/extractionPrompt.js`). Adding another provider
(OpenAI, Mistral, …) means one new file under
`src/lib/receipt-parsing/strategies/` matching the existing shape (`id`,
`label`, `isConfigured()`, `parse(imageBase64, mediaType, onProgress,
categoryNames)`), listed in `src/lib/receipt-parsing/index.js`.
`spatialStrategy` (Free OCR) always stays available as the no-config
fallback.

The old server-side approach (`supabase/functions/parse-receipt/`, one
shared hardcoded key) still exists but isn't wired up to anything — kept as
a reference if you'd rather run a centralized paid option than BYOK.

The same Scan settings/BYOK setup also powers a second, independent feature:
[categorizing bills after an import](#categorizing-bills-after-an-import),
by title alone, no image involved.
</details>

## Editing items

Every value on an item's row — name, unit price, quantity, total — is
click/tap-to-edit directly in place (`src/components/InlineEditable.jsx`):
click it, it becomes a text input; Enter or clicking away saves, Escape
reverts. Clearing a field and confirming always reverts rather than saving a
literal `0`.

The row shows **unit price × quantity** next to the total (e.g. "$1.29 x 2
$2.58"). Editing unit price or quantity recalculates the total; editing the
**total** instead back-solves the unit price with quantity held fixed — so a
corrected total (say, a receipt line manually fixed from $1.29 to $1.50 a
unit) never leaves a stale unit price disagreeing with it in a CSV or recap
export.

## Backdating (or postdating) a bill

There's no separate date column — `created_at` already doubles as a bill's
date everywhere (sorting, grouping, stats). Click-to-edit it right on the
bill's own page — same `InlineEditable` component as item editing, just with
the browser's native date picker. Keeps the bill's original time-of-day,
only swapping the calendar day, so it doesn't silently reorder relative to
same-day bills by landing on midnight.

## Settings page

`/settings` (account menu → Settings) holds everything account-level in one
place: your display name, dark mode, currency, and — collapsed by default,
since both are long — Spending thresholds and Scan settings. The account
menu itself now only holds what you'd actually reach for in the moment: How
to use, Your stats, Settings, About, Sign out.

Thresholds and Scan settings are also still their own standalone pages
(`/thresholds`, `/scan-settings`) for the existing deep links elsewhere in
the app (Your Stats' "Manage thresholds →", the scan button's "change"
link) — same underlying component either way
(`src/components/ThresholdsSection.jsx` /
`src/components/ScanSettingsSection.jsx`), not two copies to keep in sync.

## Currency

A currency picker in Settings — a curated set of major currencies (EUR, USD,
GBP, CHF, JPY, CAD, AUD), not the full ISO list. Purely a *display*
preference (which symbol to show) — every amount stored is a plain number
with nothing attached, so this is not real multi-currency conversion.
Stored per device; two people in the same group can see different symbols
for the same underlying numbers.

## Categories

Every group starts with seven seeded categories (Groceries, Eating out,
Household, Bills & utilities, Transport, Health, Other) — add, rename, or
delete freely from Group Settings. A bill's category is the common case
(one tap covers the whole receipt); an individual item can override it when
it genuinely belongs somewhere else. Deleting a category in use doesn't
block anything — every bill/item that referenced it just falls back to
uncategorized.

Each category has a color, shown as a small dot wherever the category
appears — a 10-color preset plus the browser's own picker for anything else,
changeable any time from Group Settings.

## Spending thresholds

A personal (not group) monthly budget per category, set at **Settings →
Spending thresholds** — profile-level since you're very possibly in more
than one group. Categories with the same name (trimmed, case-insensitive)
across every group you're in share one budget.

Shows as a progress bar on **Your Stats** (`/stats`) once set — always
compared to the *current calendar month*, regardless of whatever period Your
Stats' own selector shows, and always your own proportional share of what's
been spent, never what you've fronted for anyone else.

## Period-over-period comparison

Group Stats and Your Stats both compare whatever period you're viewing
(week/month/year) against the equivalent previous one — a "▲ 15% vs last
period" badge next to the total and each category's own bar. A category with
nothing spent last period shows "new vs last period" instead of a
nonsensical percentage. Your Stats includes departed groups in both figures,
via their frozen departure snapshots.

## Time period controls

`TimeRangeSelector` (`src/components/TimeRangeSelector.jsx`) is the
week/month/year/all-time picker shared by both stats pages. The ‹ / ›
single-step buttons also respond to the ← / → arrow keys — see [Keyboard
navigation](#keyboard-navigation).

<details>
<summary>Jump tiers, saved defaults, and background backfill</summary>

- **Year label in week view** — a week's own label ("Aug 17 – Aug 23") never
  showed which year; now shown on its own line above the range (both years,
  on a boundary-spanning week).
- **Jumping across long spans** — beyond the ordinary ‹/› step, month view
  gets ‹‹/›› (a full year); week view gets two extra tiers, ‹‹/›› (a month)
  and ‹‹‹/››› (a year) — a year-jump alone still left up to ~25 clicks to
  land on one specific week.
- **A shared default period** — every stats page opens on your saved default
  (out of the box, Month). Browse to a different tab and a "Set \_\_\_ as
  default" link appears; it's one preference, not one per page — changing it
  anywhere changes it everywhere.
- **Where thresholds sit on Your Stats** — pinned to the very top or very
  bottom of the page (never mid-page), since thresholds are always
  this-month regardless of the selector while everything else on the page
  moves with it. A per-device toggle, no obviously-correct default.
- **Recent history loads first** — this year plus last year's bills load up
  front for an instant render; the rest backfills in the background. A small
  note shows if you page back (or check "All time") before that finishes.

All of the above persist in `localStorage`, same mechanism as currency and
dark mode — they won't follow you to a different device.
</details>

## Spending graphs

A line chart of spending over time, plus a donut chart by category — a
separate, lazy-loaded page (`AccountGraphs.jsx` / `GroupGraphs.jsx`) reached
via "See graphs →" from either stats page, so nobody who never opens it pays
anything for it.

Three tabs — **This month** (one point per day), **Last 4 months** and
**This year** (one point per month; a finer per-week/per-bill tier was tried
for the wider views and reverted for reading too spiky even with curve
smoothing). A category dropdown switches the line's y-axis to that
category's own spending; clicking a donut slice does the same — one shared
selection between the two charts.

Both charts are hand-rolled SVG, not a charting library, consistent with the
rest of the app.

## Keyboard navigation

Opt-in — nothing changes until you actually press one of these, and typing
into any field (search, an amount, a filter) is never intercepted.

| Where | Keys | Does |
|---|---|---|
| A group's bill list, the groups list | `↑` / `↓` | Move a highlighted selection |
| Same lists | `Enter` | Open the highlighted row |
| Same lists | `←` / `→` | Flip pages |
| A group's bill list | `/` | Jump straight to search |
| Stats pages | `←` / `→` | Previous / next period |
| Anywhere with a popover open | `Esc` | Close it (menus, search, filters) |

The bill list's Pagination bar also sticks to the bottom of the viewport
rather than sitting wherever the last row happens to land, so it's always
reachable without a scroll — applies everywhere `Pagination` is used, not
just the bill list.

## Recurring bills

A template for something that repeats (rent, a subscription) at
`/groups/:groupId/recurring` — a fixed amount, one payer, a fixed split. A
generated occurrence is just an ordinary bill afterward, editable (including
switching it to multiple payers) like any other.

There's no scheduled job anywhere in this app: `processDueRecurringBills()`
runs whenever anyone opens the group and creates whatever's due — every
missed occurrence in order if the group's gone quiet a while, not just the
most recent one. A deliberate tradeoff against adding background
infrastructure just for this; the honest cost is a bill appears when it's
next generated, not exactly on its due date. Deleting a template asks
whether to keep or delete the bills it's already generated.

## What a bill row shows

Each bill in the list shows its total, plus what that *specific bill* means
for you personally: **"You borrowed [x]"**, **"You lent [x]"**, or **"You
are not involved"** — independent of the group's overall running balance
shown further down the page, since fronting one bill doesn't mean you're
"owed" overall if you're behind on others.

## Searching and filtering bills

A group's bill list has a **Search** bar and a **Filters** panel, both
collapsed by default (opening search: the **Search** button, or `/` from
anywhere on the page). `src/lib/billFilters.js` combines all of it
client-side against already-loaded data, so typing never fires its own
round-trip:

- **Search** — a bill's title or note, case-insensitive substring match.
- **Tags** — a bill's effective tag set is every item's own category (or the
  bill's, or "uncategorized"); a **Match any / Match all** switch decides
  whether one selected tag is enough or every selected tag must appear
  somewhere in the bill.
- **Amount** — a two-handle range slider bounded by the group's actual
  cheapest/most expensive bill (`src/components/RangeSlider.jsx`), or type an
  exact value into either number below it.

## Bill actions: deleting and sharing

Every bill has a **⋮** menu (`src/components/BillActionsMenu.jsx`) with
**Select**, **Share**, and **Delete**. With one or more bills selected, a bar
above the list adds **Share** (one combined recap) and **Delete selected**.

For wiping a group's *entire* bill history in one shot, Group Settings'
**Danger zone → Delete all bills** is the one bill-deleting action that's
admin-only — every other delete path stays open to any active member. It
asks whether to also delete the group's settle-up (payment) records, and
requires typing the group's exact name to confirm (`TypedConfirmModal`),
since it can erase everything a group has ever recorded. Every delete path
except this one (and even then, only if asked) leaves payment records
untouched — they're a separate ledger of cash that's already changed hands,
not data owned by any particular bill.

## Your groups & inviting people

The groups list (`/`) shows your groups first, paginated at 10 per page,
with "Create a new group" below it rather than above. **Invite** on a
group's page gives a QR code (for someone standing next to you) plus a
shareable link — both generated client-side, no third-party image service
involved.

## Personal spending

The **Personal** tab on the groups list (`/`) opens a single-member group
that's just yours — auto-created the first time you open the tab, no setup
step. It's a real group under the hood (`groups.is_personal`), so
categories, thresholds, receipt scanning, recurring bills, stats, and CSV
export all just work; only Invite, "paid by"/"split with" pickers, and
Settle Up are hidden, since there's never anyone but you in it. It folds
into "Your Stats" automatically, same as any other group.

## The in-app guide

`/guide` (also reachable from the account menu as "How to use") is a
searchable set of collapsible sections covering the whole app — worth
keeping in sync as features land; it's one file, `src/pages/Guide.jsx`, each
section self-contained.

## Recaps, PDFs, and CSV

Every bill, every group's settle-up, and every stats page has a single
**Share recap** button (`src/components/ShareButton.jsx`) with two options:

- **Share as text** — via the phone's native share sheet (falling back to
  clipboard on desktop), formatted with WhatsApp's own `*bold*`/`_italic_`
  syntax rather than markdown, since markdown wouldn't render there.
- **Download as PDF** — the browser's own print dialog, not a new dependency.
  Renders through a React portal into a dedicated `#print-root` sibling of
  `#root`, swapped visible via `@media print` — the fix for a real bug a
  `visibility: hidden` approach had (invisible content still reserved its
  full height, routinely producing a trailing blank page).

A bill, and a group's own settle-up recap, also get a standalone **Export
CSV** button (`src/lib/csv.js`) — one row per item for a bill, or the whole
group's bill history for a group export.

### Importing from Splitwise

`/groups/:groupId/import` (linked from Group Settings) reads a Splitwise CSV
export directly. Splitwise gives each row a **net balance** per person
(positive = owed, negative = owes), not a raw share amount —
`src/lib/splitwiseImport.js` reconstructs who paid and each person's actual
share from that, dated to match the original expense. A settle-up transfer
between two people (Splitwise's own `Payment` category) is recognized
separately and imported as a real payment record instead of a bill literally
titled "A paid B."

<details>
<summary>What can't be reconstructed automatically, and proof-checking</summary>

Two shapes can't be resolved from net balances alone, and go to a
one-at-a-time review step instead of being guessed:

- **Nobody has a positive net** — a personal expense logged just for
  tracking (net comes out to exactly 0, indistinguishable from "not involved
  at all").
- **More than one person has a positive net** — a real multi-payer expense,
  but Splitwise's export never states who contributed how much.

The review step: pick a payer (or "Multiple payers…") and who it's split
with — checkboxes defaulting to an even split, with "Split unevenly…"
available, the same amount-entry modal the rest of the app already uses.
"Skip for now" imports with no payer set rather than forcing a decision.

**Proof-checking**: Splitwise's own export ends with a "Total balance" row
stating each person's all-time net directly. After import,
`checkImportBalances()` runs the app's real `computeBalances()` over
everything just imported (plus the group's existing payments) and compares
it against that row, a few cents' tolerance for rounding drift across
hundreds of reconstructed shares. A mismatch is shown, never a hard stop —
"Continue anyway" is always available.
</details>

### Categorizing bills after an import

`/groups/:groupId/categorize` (from Group Settings) catches up an import's
uncategorized bills in two passes, both producing only *suggestions* — a
bill only changes once you review and confirm:

1. **Free and instant** — reads Splitwise's own original category back out
   of each bill's note and matches it against the group's own category
   names (exact match, then a small alias table for common near-misses like
   "Dining out" → "Eating out").
2. **AI, for whatever's left** — classifies by title alone, using whichever
   provider is already configured in Scan settings. Never invents a new
   category (only ever chooses from the group's existing list) and returns
   `null` rather than guess when unsure.

<details>
<summary>Title deduplication and keyword clustering</summary>

Titles are deduplicated before either pass runs (`buildTitleGroups()`) —
every bill sharing the exact same title becomes one suggestion, which is
also what keeps the AI pass cheap (distinct titles batched roughly 150 at a
time, rather than one call per bill).

The same real merchant often still splits across several *different* exact
titles ("Lidl - martedì", "LIDL 12/03", "Lidl via Roma"). The review screen
finds words recurring across multiple title groups
(`findKeywordClusters()` — no stopword list or language assumption, just
statistical frequency) and surfaces them as a "Common patterns" section with
an "Apply to all" shortcut per word — purely a convenience for filling in
the per-row dropdowns faster; nothing here is fed to the AI or applied on
its own.

An optional free-text field lets you tell the AI something about your
household's bills once — what language titles are in, local slang, what a
cryptic one-word title like "Iliad" actually is — saved and reused for every
future run rather than retyped per group.
</details>

## How the data model works

| Table | What it's for |
|---|---|
| `profiles` | Display name per user, auto-created on signup |
| `groups` | A household/trip/circle, with an invite code and `admin_id` |
| `group_members` | Every participant — a real account (`user_id` set) or a guest (`user_id` null, `display_name` set directly). `active=false` = left/removed, kept not deleted |
| `bills` | One receipt/expense. `paid_by`, `default_buyer_ids`, `category_id` |
| `bill_payers` | Rows only once a bill's switched to multiple payers — the source of truth for who fronted it when present, `paid_by` cleared |
| `items` | One line item; `category_id` can override the bill's |
| `item_shares` | Who owes how much of each item (`member_id`, weighted `shares`) |
| `payments` | A recorded cash transfer between two participants |
| `categories` | A group's own spending categories, seeded on creation |
| `recurring_bills` | A repeating-bill template; each occurrence is a normal `bills` row, linked via `recurring_bill_id` |
| `departure_snapshots` | A frozen personal record (day-by-day, with a category breakdown) for someone who left a group |
| `spending_thresholds` | A profile-level monthly budget per category *name* |

The bill list groups under month/day date dividers, styled after Splitwise's
own activity feed (`groupItemsByDate()` in `src/lib/dateGroups.js`).
Settlement math lives entirely in `src/lib/settlement.js` — plain,
dependency-free JS worth a read; it never special-cases a real account vs. a
guest.

<details>
<summary>Guests, claiming, multiple payers, admin permissions, leaving a group</summary>

**Guests** — added from Group Settings with no account at all
(`group_members.user_id` null, just a `display_name`). Every table that
references "a person" points at `group_members.id`, so a guest works exactly
like a real account for splitting, fronting, and settling up. Removing one
just flips `active` off — restorable any time. **Deleting one permanently**
is admin-only and blocked server-side unless they're off every bill,
payment, and recurring template first, checked table-by-table rather than
relying on a blocking foreign key — `item_shares` in particular cascades on
delete, and would otherwise silently drop their share off someone else's
item with no error.

**Claiming a guest profile** — "Get claim link" on a guest generates a
one-time link sent directly to that person (not posted where the group can
see it); opening and confirming it (`claim_guest_profile()`) attaches their
real account to that exact `group_members` row, so every bill, item, and
payment they were ever part of is simply theirs — nothing to migrate.

**Multiple payers** — "Multiple payers…" opens a modal where several people
split fronting a bill, each with their own amount; nothing saves until the
amounts sum to exactly the bill's current total. `bill_payers` only gets
rows once this is used — the common single-payer case still just uses
`bills.paid_by` — and `settlement.js` funnels both through one
`creditPayers()` helper.

**Admin permissions** — one admin per group (`groups.admin_id`), starting
with whoever created it. Only the admin can remove someone *else* (anyone
can remove themselves); the role auto-passes to the longest-standing
remaining member if the admin leaves, or can be handed off directly from
Group Settings. Guest management (add/rename/archive) is open to any active
member — it's not "removing a real person against their will," so it isn't
gated the same way.

**Leaving a group** — flips `group_members.active` to `false`; nothing is
deleted, and old bills/items/payments stay exactly as they were. A
`departure_snapshots` row is computed client-side *at the moment of
removal*, while access still exists — day-by-day paid/consumed totals plus
a category breakdown — so "Your Stats" stays exactly accurate for a
departed group forever without needing to re-query it. Rejoining later just
resumes using live data, snapshot included.
</details>

## Roadmap

Roughly in likely order, nothing promised on a timeline — a personal
project, built as time and interest allow:

- Settlement/category-totals math moved into a Postgres function, if a
  genuinely large group ever needs it beyond what client-side computation
  and caching already handle
- Group-level (shared) spending thresholds, alongside the personal ones that
  exist today
- AI-assisted category suggestions during a scan itself
- Push notifications, once usage patterns make them worth the noise
- Item price tracking across visits — a real fuzzy-matching problem (item
  names from a scan aren't perfectly consistent between visits), not a
  simple lookup
- True multi-currency support (conversion within a bill/group), distinct
  from today's display-only currency picker
- A scheduled/background job for recurring bills, instead of the current
  open-the-app trigger

## What's intentionally left simple (v1)

- No partial-share stepper UI ("I only had half a portion") — the `shares`
  column already supports it, just needs a control in `ItemRow`
- No push notifications for a group-mate's new bill (realtime *within* an
  open app already works)
- No receipt photo is kept after scanning, only the extracted items
- Deleting a whole group isn't wired up yet (bills/members can be removed
  individually)
- A departure snapshot's numbers are trusted from the client, not re-derived
  server-side — reasonable for a personal-use app, worth revisiting for
  less-trusted users
- Free OCR expects an item's name and price on the same line; a wrapped item
  name won't parse correctly for that line
- OpenAI and other providers aren't built, but would follow the existing
  `ReceiptParserStrategy` shape
- A recurring template covers one payer and a fixed split only — switch a
  specific generated occurrence to Multiple payers by hand if needed
- Recurring bills generate on open, not on a schedule, so they can appear
  "late"
- Claim-guest links trust possession of the link, same model as the general
  group invite link
- PDF export goes through the browser's print dialog, not a one-tap download
- `admin_id` changes are only ever made through `transfer_admin()` in the
  app's own code — the RLS policy itself is a blanket per-row check, so it
  can't stop a raw API call from changing it directly
- Spending thresholds only cover the current calendar month, no history view
- A snapshot recorded before category tracking existed has no category
  breakdown for its days, only the original totals
- The budget indicator only shows on Your Stats, not any single group's own
  stats page
- Cross-group category merging can rarely split into two entries if a
  category's exact casing changes elsewhere *after* a threshold's been
  saved for it — re-saving it under the new casing fixes it
- Category totals aren't reflected in recap text, PDFs, or CSV export yet —
  those still just show items and prices

## Security notes

- Every table has row-level security scoped to "members of the same group"
  — see the policies at the bottom of `schema.sql`.
- Each person's own Gemini/Claude API key (if they use one) lives only in
  their browser's local storage, entered once in Scan settings — sent
  directly from their browser to that provider, never through Supabase,
  never shared with anyone else in the group.
- Group names and invite codes are only visible to members; joining a group
  goes through the `join_group_by_code()` Postgres function so `groups`
  itself doesn't need to be publicly readable.
