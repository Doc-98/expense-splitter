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
- [Group settings page](#group-settings-page)
- [Updates section, and the service worker](#updates-section-and-the-service-worker)
- [Add to home screen](#add-to-home-screen)
- [Currency](#currency)
- [Categories](#categories)
- [Budgets](#budgets)
- [Period-over-period comparison](#period-over-period-comparison)
- [Time period controls](#time-period-controls)
- [Spending graphs](#spending-graphs)
- [Keyboard navigation](#keyboard-navigation)
- [Subscriptions](#subscriptions)
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
   (default).
5. Once you've deployed (**"3. Run it / deploy it"** below): set
   **Authentication → URL Configuration → Site URL** to your deployed app's
   URL, and add
   `your-deployed-url/reset-password` under **Redirect URLs** on the same
   page. Both matter — Supabase rejects a redirect target that isn't on
   this allowlist. Magic links redirect to the Site URL's bare root
   (already allowed by default), but password resets redirect to
   `/reset-password` on top of it, which isn't — skip this and "forgot
   password" specifically breaks silently, even though magic-link sign-in
   works fine.

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

### Running the tests

```bash
npm test             # runs the whole suite once
npm run test:watch   # re-runs on file change, for working on one thing
```

[Vitest](https://vitest.dev), no separate config beyond `vitest.config.js`
(deliberately its own file, not merged into `vite.config.js` — that one's
VitePWA plugin generates a service worker on every build, which a test run
shouldn't pay for). `npm run lint`, `npm test`, and `npm run build` all run
on every push/PR via `.github/workflows/test.yml` — no Supabase project or
any other secret needed for any of the three.

**What's covered**: `src/lib/*.test.js`, colocated next to the module they
test (`splitEvenly.js` → `splitEvenly.test.js`, same folder) — this app's
pure business logic: balance/settlement math (`settlement.js`, the one most
worth trusting completely — a wrong number there is the worst kind of bug
this app can ship), bank statement parsing and column detection
(`bankStatementRows.js`, `bankStatementDetection.js`), the category-mapping
logic behind the bank-import wizard's "Match bank categories" step
(`bankStatementReview.js`, `bankCategoryMappings.js`), the AI categorization
prompt/response handling (`billCategorization/classifyPrompt.js`), CSV
parsing/export (`csv.js`), and the smaller date/number-formatting helpers
each of those leans on.

**What isn't**: components/pages (nothing under `src/pages/` or
`src/components/` has a test file), anything that talks to Supabase
directly, and the AI-calling strategy modules themselves
(`billCategorization/strategies/`, `bank-statement-parsing/`,
`receipt-parsing/` — these make real network calls to whichever provider is
configured, so testing them meaningfully needs mocking the provider
response, not just running the code). If you're adding a test for one of
those, `vi.mock()` the strategy/provider boundary rather than the whole
module — keeps the test exercising real parsing/matching logic, not a
hand-waved stub of it.

**Adding a test**: colocate `yourModule.test.js` next to `yourModule.js`,
`import { describe, it, expect } from 'vitest'`. Vitest runs under jsdom
(see `vitest.config.js`), so `localStorage` and other browser globals work
directly — no environment setup needed even for something like
`bankCategoryMappings.test.js`, which exercises real `localStorage` rather
than a mock of it.

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

"Scan a receipt" is two entry points, not one: **Take photo** goes straight
to the camera (`accept="image/*" capture="environment"`); **Choose file**
opens the normal file picker with a wider `accept` that also admits a PDF,
or a plain-text/HTML export — two separate `<input>`s rather than one wider
`accept` list, since iOS drops its own Take Photo/Photo Library shortcuts
the moment `accept` includes a non-image type. `src/lib/receipt-parsing/
mediaKind.js` classifies whichever file comes back as image/document/text;
Claude and Gemini attach a PDF as a document block the same way they attach
an image, and inline plain text/HTML straight into the prompt. Free OCR and
Ollama are both fundamentally image-only (pixels, or a vision model's own
`images` array) and fail fast with an actionable message on anything else,
rather than mishandling it.

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

The price fields (adding an item, or editing one in place) accept a small
arithmetic expression, not just a plain number — `2,30-1,25` saves as `1,05`.
`src/lib/parseNumber.js`'s `parseAmount()` is a hand-rolled recursive-descent
evaluator (`+ - * /`, unary minus, parentheses; deliberately never
`eval()`/`Function()`), tried only when the plain-number parse fails, and
rounds an *evaluated* result to the cent to correct binary floating-point
drift (`0.1 + 0.2` landing on `0.30000000000000004` otherwise). Kept separate
from `parseNumber()` itself, which also parses text nobody actually typed (an
OCR'd receipt line, an imported bank statement row) — there, a stray "-" from
a misread character silently evaluating as subtraction would turn a bad read
into a wrong number instead of the `NaN` that correctly flags it today. These
fields' `pattern` attribute is a permissive character allowlist for the same
reason iOS's decimal keypad gets a minus key at all: any `pattern` containing
"-" unlocks it, and — since fixing this — one wide enough to admit everything
`parseAmount` accepts, not a stricter one that would just silently block
submission of anything it doesn't recognize (comma-decimal prices included).

## Backdating (or postdating) a bill

There's no separate date column — `created_at` already doubles as a bill's
date everywhere (sorting, grouping, stats). Click-to-edit it right on the
bill's own page — same `InlineEditable` component as item editing, just with
the browser's native date picker. Keeps the bill's original time-of-day,
only swapping the calendar day, so it doesn't silently reorder relative to
same-day bills by landing on midnight.

## Settings page

Tapping your name, top right of any page, opens `/settings` — everything
account-level, arranged into sections down a side nav rather than a single
long scroll: **Profile** (display name, dark mode, currency, and the two
per-device stats preferences below), **Groups** (every group you're in,
with a way to leave one directly), **Budgets**, **Scan**, **How to Use**,
**Updates**, and **About**. **Sign Out** sits at the bottom of the nav,
split off by its own divider — it's an action, not a section, and opens a
confirm sheet rather than switching content.

The nav starts as icons only; the header's hamburger button expands it
with labels. Selecting a section swaps `.settings-content` in place — one
page, not a chain of routes — so `Settings.jsx` itself is just this shell
(`SettingsNav.jsx` + a `CONTENT` lookup); each section's actual UI lives in
its own component, several of them shared:

| Section | Component |
| --- | --- |
| Groups | `SettingsGroupsSection.jsx` (new) |
| Budgets | `BudgetsSection.jsx` |
| Scan | `ScanSettingsSection.jsx` — also `/scan-settings` |
| How to Use | `GuideSection.jsx` — also `/guide` |
| Updates | `SettingsUpdatesSection.jsx` (new) |
| About | `AboutSection.jsx` — also `/about` |

The three with a standalone route too are shared components rather than two
copies to keep in sync — the routes stay around for existing deep links
elsewhere in the app (the scan button's "change" link). Budgets used to have
one as well (`/budgets`, for Your Stats' own "Manage budgets →" link) — both
are gone now that Settings → Budgets reaches the exact same component.

Sign Out (`src/lib/signOut.js`) and leaving a group from either entry point
(`src/lib/leaveGroup.js`) are both pulled into shared `lib/` functions for
the same reason — Group Settings' own Danger Zone "Leave group" and the
Groups section's "⋮ → Leave group" need to do the exact same thing,
snapshot included (see "How the data model works" below), not two copies
that could quietly drift apart.

Three different confirm patterns, by how much is at stake:

- **`ConfirmSheet.jsx`** (a bottom sheet) — a plain yes/no worth a beat of
  "are you sure" but nothing more: Sign Out, Leave group.
- **`TypedConfirmSheet.jsx`** (same sheet chrome, plus a "type the exact
  word to confirm" gate) — the genuinely hard-to-reverse ones, where a
  click alone is too easy to do by habit: Delete all bills, Delete group.
- The app's existing centered **`.modal-panel`** dialogs stay as they are
  for anything content-heavy rather than a confirmation as such (the
  multi-payer split, a bill's own delete-selected count).

## Group settings page

Same left-rail shell as the account Settings page above (`SettingsNav.jsx`,
reused as-is) — **General** (the group's name), **Members**, **Guests**,
**Categories**, **Subscriptions**, **Data** (Splitwise import, categorizing
older bills, and — Personal only — bank statement import), and **Danger
Zone**, pinned at the bottom of the rail in warm red, same treatment the
account page gives Sign Out. `GroupSettings.jsx` itself is just this shell
now (a `CONTENT` lookup, same pattern as `Settings.jsx`); each tab's actual
UI lives in its own component:

| Section | Component |
| --- | --- |
| General | `GroupGeneralSection.jsx` |
| Members | `GroupMembersSection.jsx` |
| Guests | `GroupGuestsSection.jsx` |
| Categories | `GroupCategoriesSection.jsx` |
| Subscriptions | `GroupSubscriptionsSection.jsx` |
| Data | `GroupDataSection.jsx` |
| Danger Zone | `GroupDangerZoneSection.jsx` |

Every section fetches its own data independently (`useParams()` for
`groupId`, no props from the shell) rather than the shell loading
everything up front and passing it down — matching how the account
Settings page's own sections already work, and correct for free here too:
since only the active tab is ever mounted, switching to a tab always gets
this group's *current* data, not something read once and gone stale while
you were on a different one. `lib/groupRole.js` is the one small shared
helper — a combined "group name + is_personal + am I the admin" fetch for
the sections that need to gate an admin-only action but don't otherwise
need the full member roster (Danger Zone); Members and Guests each derive
"am I the admin" from the roster they fetch for their own list anyway, no
second query needed. `GroupDataSection.jsx` is the one section that does
take a prop (`isPersonal`) — the shell already knows it, needed to decide
which tabs even apply (see below), so passing that one boolean down beats
a second round-trip just to re-learn it.

Members and Guests are the two tabs only shown for a real group — a
personal space has exactly one member (you) forever, with no invite code
ever surfaced to change that (see `is_personal` on the `groups` table), so
neither tab is offered there at all rather than existing and showing
nothing.

Danger Zone has three actions, not all shown to everyone:

- **Leave group** — offered to any real member of a non-personal group,
  confirmed via `ConfirmSheet.jsx` (the same plain bottom-sheet yes/no Sign
  Out uses), since leaving is worth a beat of "are you sure" but nothing
  heavier.
- **Delete all bills** and **Delete group** — admin-only, confirmed via
  `TypedConfirmSheet.jsx` instead (same sheet chrome, plus a "type the
  group's exact name to confirm" gate, case-sensitive, no trimming), since
  either erases something in a single click that can't be undone. Replaces
  what used to be `TypedConfirmModal.jsx` (a centered dialog) — deleted
  outright once nothing referenced it anymore, rather than kept around as a
  second, unused pattern.

**Delete group** is new: `delete_group()` (schema.sql; standalone migration
`admin_delete_group.sql`) is the actual nuclear option — not just a group's
bills, the group itself, cascading to every member, guest, category,
subscription, bill, payment, and departed member's own frozen snapshot for
it. Same admin gate as `delete_all_group_bills()`, plus one more: a personal
space can never be deleted this way (it's recreated automatically the next
time its owner opens the Personal tab, not something whose lifecycle is
managed), enforced server-side too, not just by the client never offering
the button.

## Updates section, and the service worker

`registerType` in `vite.config.js` is `'prompt'`, not `'autoUpdate'` — a
newly-deployed version installs in the background but waits until
something explicitly activates it, via `useRegisterSW()`
(`virtual:pwa-register/react`). `PwaUpdater.jsx`, mounted once at the app's
root, is what actually registers the service worker on load, independent
of whether anyone ever opens Settings; `SettingsUpdatesSection.jsx` calls
the same hook again for its own local "check, then show a checkmark or a
Reload button" UI — registering twice is harmless
(`navigator.serviceWorker.register()` is idempotent), and keeps that
component self-contained. `"Check for updates"` calls
`registration.update()` to force an on-demand check rather than waiting
for the browser's own infrequent one.

`workbox.clientsClaim: true` in the `VitePWA()` config is what makes
"Reload to update" actually reload. `skipWaiting()` (sent as a
`SKIP_WAITING` message when that button is clicked) only moves the new
service worker into the active state — on its own it does *not* hand it
control of tabs that are already open, so the browser never fires
`controllerchange`, which is the event `useRegisterSW`'s built-in
reload-after-update logic is waiting on. Without `clientsClaim`, clicking
the button silently did nothing: the new worker activated in the
background, but the open tab kept being served by the old one until
someone closed and reopened it by hand. `clientsClaim` makes the
newly-active worker claim already-open tabs too, which is what actually
fires that event and lets the reload happen.

`src/lib/appVersion.js` holds `APP_VERSION` and a short `WHATS_NEW` list —
read by the version chip in `AppHeader.jsx` and by the Settings > Updates
section. `APP_VERSION` ("1.\<PR number\>") is computed automatically, not
hand-maintained: `vite.config.js` shells out to `git log` at build time and
walks recent commit subjects (newest first) via
`src/lib/versionFromCommit.js` until it finds one with the " (#123)" suffix
GitHub appends to every squash-merge, then injects the result as
`import.meta.env.VITE_APP_VERSION`. That keeps the number mechanically tied
to what actually merged, instead of relying on whoever opens the next PR to
remember to bump it by hand. `WHATS_NEW` stays hand-written — summarizing
"what a human would care about" isn't something a commit subject alone can
do — so replace that list with each PR that ships something user-visible.

## Add to home screen

`InstallPrompt.jsx`, also mounted at the app's root, shows a small one-time
shelf the first time anyone opens Spesa in a browser tab that fires
`beforeinstallprompt` (Chromium-based — Chrome/Edge, desktop or Android) —
captured instead of letting the browser show its own default mini-infobar,
and remembered in `localStorage` so it never asks twice. Safari (iOS and
macOS) never fires this event at all, so the banner simply never appears
there — no hand-rolled "Share → Add to Home Screen" instructions for it
yet.

## Currency

A currency picker in Settings — a curated set of major currencies (EUR, USD,
GBP, CHF, JPY, CAD, AUD), not the full ISO list. Purely a *display*
preference (which symbol to show) — every amount stored is a plain number
with nothing attached, so this is not real multi-currency conversion.
Stored per device; two people in the same group can see different symbols
for the same underlying numbers.

## Categories

Every group starts with seven seeded categories (Groceries, Eating out,
Household, Bills & utilities, Transport, Health, Other). Group Settings →
**Categories** adds new ones via the same input-with-submit pattern as
Create group/Add bill (an arrow fades in inside the field once it's not
empty); each existing one's "⋮" menu covers **Rename**/**Delete**. Deleting
a category in use doesn't block anything — every bill/item that referenced
it just falls back to uncategorized.

A bill's category is the common case (one tap covers the whole receipt); an
individual item can override it when it genuinely belongs somewhere else.

Each category has a color, shown as a small dot wherever the category
appears — a 10-color preset plus the browser's own picker for anything else,
changeable any time from Group Settings → Categories.

## Budgets

A personal (not group) monthly budget per category, set at **Settings →
Budgets** — profile-level since you're very possibly in more than one
group. Categories with the same name (trimmed, case-insensitive) across
every group you're in share one budget.

Renamed from "Spending thresholds" in the UI — kept as "threshold"
internally (state names, the `spending_thresholds` table, `lib/thresholds.js`)
to avoid a database migration and a much wider rename for no visible
benefit; only user-facing copy changed.

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
  (out of the box, Month), set from Settings → Profile; it's one preference,
  not one per page — changing it there changes it everywhere.
- **Where Budgets sits on Your Stats** — pinned to the very top or very
  bottom of the page (never mid-page), since budgets are always this-month
  regardless of the selector while everything else on the page moves with
  it. A per-device toggle, set from Settings → Profile, no obviously-correct
  default.
- **Recent history loads first** — this year plus last year's bills load up
  front for an instant render; the rest backfills in the background. A small
  note shows if you page back (or check "All time") before that finishes.

All of the above persist in `localStorage`, same mechanism as currency and
dark mode — they won't follow you to a different device.
</details>

## Spending graphs

A line chart of spending over time, plus a donut chart by category — a
separate, lazy-loaded page (`AccountGraphs.jsx` / `GroupGraphs.jsx`) reached
via the line-chart icon in either stats page's own header, so nobody who
never opens it pays anything for it.

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

The bill list's Pagination bar also docks near the bottom of the viewport
once scrolling would otherwise carry it past that point (`position:
sticky`, not `fixed` — a permanently-floating pill was tried and reverted
for staying visible well past where it should settle into the page's own
flow on a short page). Switching pages via the pill itself re-scrolls to
the new page's own bottom rather than leaving it at a stale scroll position
— applies everywhere `Pagination` is used, not just the bill list.

## Subscriptions

"Subscription" is user-facing terminology only — everything underneath
(the `recurring_bills` table, `lib/recurringBills.js` and everything it
exports, `recurring_bill_id` on `bills`) keeps its original name throughout
the codebase. Same reasoning as "Spending thresholds" becoming "Budgets"
everywhere it's actually shown: renaming the schema/module too would cost
a real migration and a much wider rename for zero visible benefit.

A template for something that repeats (rent, a subscription) — a fixed
amount, one payer, a fixed split — managed from Group Settings →
**Subscriptions** (`GroupSubscriptionsSection.jsx`; the standalone
`/groups/:groupId/recurring` page this used to be its own route for is
gone, folded into the tab). A generated occurrence is just an ordinary
bill afterward, editable (including switching it to multiple payers) like
any other.

Each subscription row has a "⋮" menu — **Edit**, **Pause**/**Resume**,
**Delete**:

- **Edit** re-populates the same form used to create one (scrolled to and
  outlined so it's clear which one it's now pointed at) and re-submits
  through `updateRecurringBill()` instead of `addRecurringBill()`. It's
  deliberately narrower than creation — only what a generated bill
  *contains* (title, amount, category, who paid, who splits it), never
  **frequency** or **start date**, since those anchor `next_due_date`/
  `day_of_month`, already stored and potentially already advanced past the
  original start date; editing them after the fact risks silently
  corrupting future occurrences. Delete and recreate covers "I want this on
  a different schedule" instead.
- The "Add"/"Save changes" button stays disabled until title and amount are
  genuinely valid (and, in a real group, at least one person is still
  selected to split with).

There's no scheduled job anywhere in this app: `processDueRecurringBills()`
runs whenever anyone opens the group and creates whatever's due — every
missed occurrence in order if the group's gone quiet a while, not just the
most recent one. A deliberate tradeoff against adding background
infrastructure just for this; the honest cost is a bill appears when it's
next generated, not exactly on its due date. Deleting a template asks
whether to keep or delete the bills it's already generated.

`computeDueOccurrences()` compares each template's `next_due_date` (a bare
`"YYYY-MM-DD"` string straight out of Postgres) against local midnight
today — it parses that string as local midnight itself (`` `${date}T00:00:00` ``),
not via a bare `new Date(string)`, which JS parses as midnight *UTC*. Get
that wrong and, in any timezone ahead of UTC, a template starting "today"
silently doesn't fire its first occurrence until a day late (see
`recurringBills.test.js`, which regression-tests this in a real subprocess —
vitest's own worker pool doesn't honor a timezone change made mid-test).

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

Opening a bill and coming back normally resets all of this — plain
component state on `GroupView.jsx`, which unmounts on that round trip since
bills live on their own route. **Sticky filters** (Settings → Groups →
Display, off by default) opts into keeping it instead:
`src/lib/groupFilterState.js` is a small in-memory-only cache (deliberately
no `sessionStorage` mirror, unlike most of this app's other caches — a real
page refresh should still clear it) that `GroupView.jsx` seeds its filter
state from on mount and writes back to on every change, only while the
preference is on.

## Bill actions: deleting and sharing

Every bill has a **⋮** menu (`src/components/BillActionsMenu.jsx`) with
**Select**, **Share**, and **Delete**. With one or more bills selected, a bar
above the list adds **Share** (one combined recap) and **Delete selected**.

Press and hold a bill row for a faster way into select mode with that row
already checked — `src/lib/useLongPress.js` is a small, reusable Pointer
Events-based hook (covers touch/mouse/pen with one set of listeners; not
this app's usual separate touchstart+mousedown pair, safe here specifically
because nothing else on the row listens for those legacy events too). It
swallows the click that still follows the eventual pointerup by calling
`event.preventDefault()` from its own `onClick` — since `Link`'s own click
handler only navigates `if (!event.defaultPrevented)`, that's enough to
stop a long press from *also* navigating into the bill, no extra
navigation-blocking logic needed on `GroupView.jsx`'s side.

For wiping a group's *entire* bill history in one shot, Group Settings'
**Danger Zone → Delete all bills** is the one bill-deleting action that's
admin-only — every other delete path stays open to any active member. It
asks whether to also delete the group's settle-up (payment) records, and
requires typing the group's exact name to confirm (`TypedConfirmSheet`, see
"Group settings page" above), since it can erase everything a group has
ever recorded. Every delete path except this one (and even then, only if
asked) leaves payment records untouched — they're a separate ledger of
cash that's already changed hands, not data owned by any particular bill.

## Your groups & inviting people

The groups list (`/`) shows your groups first, paginated at 10 per page,
with "Create a new group" below it rather than above. **Invite**, in Group
Settings' **Members** tab, gives a QR code (for someone standing next to
you) plus a shareable link — both generated client-side, no third-party
image service involved.

## Personal spending

The **Personal** tab on the groups list (`/`) opens a single-member group
that's just yours — auto-created the first time you open the tab, no setup
step. It's a real group under the hood (`groups.is_personal`), so
categories, budgets, receipt scanning, subscriptions, stats, and CSV
export all just work; only Invite, "paid by"/"split with" pickers, and
Settle Up are hidden, since there's never anyone but you in it. It folds
into "Your Stats" automatically, same as any other group.

### Importing a bank statement

`/groups/:groupId/import-bank-statement` (linked from the Personal space's
own Group Settings → **Data** — not available for a real group yet) turns a
bank or credit-card statement into bills.

#### Getting the data in

- **CSV or Excel export**, if your bank offers one — parsed locally, no AI
  required. `src/lib/bankStatementRows.js` does the actual
  column-detection-plus-parsing for both formats: common column aliases
  (Date/Payee/Amount, or separate Debit/Credit), currency symbols, either
  thousands-separator convention ("1,234.56" or "1.234,56"), and
  parenthesized negatives. `bankStatementCsv.js`/`bankStatementXlsx.js` are
  thin per-format wrappers around it — Excel via a lazily-loaded
  `read-excel-file`, so it doesn't cost every other page's bundle size.
  Excel exists specifically for mobile: redacting a PDF or exporting to CSV
  is realistically a desktop-only step, and a bank that only offers
  PDF/Excel downloads would otherwise leave a mobile user stuck.

  If Claude, Gemini, or Ollama is set up in Scan settings, the heuristic
  column match also gets a second opinion from that AI (`src/lib/
  bankStatementColumns/`, sent the header row plus a few sample rows, not
  the whole file) — useful for a header the alias list doesn't recognize
  (a different language, an unusual bank's own wording). The heuristic's
  result is trusted by default; the AI's only replaces it when the two
  genuinely disagree, and always with a review-screen notice to
  double-check dates and amounts — this app's usual "flag, never apply
  silently" rule for an AI suggestion (see `bankStatementTabular.js`, the
  orchestrator both formats go through). Since the heuristic already works
  standalone here (unlike the PDF path below), this one check has its own
  opt-out (`bankStatementAiColumnCheck` in `receiptSettings.js`, on by
  default), independent of whichever AI service is configured for
  everything else.

- **PDF statement** — read by whichever AI service is set up in Scan
  settings (Claude or Gemini only; Ollama's local models don't reliably
  take a multi-page PDF the way those two hosted APIs do, so there's no
  local fallback here the way receipt scanning has one). Strip anything
  sensitive beyond the transactions themselves — account number, name,
  address — before uploading, since the file is sent to that provider.

- **Bring your own AI chat**, for anyone without a Claude/Gemini API key
  set up here — a Claude Pro subscriber with no API tokens, say. A
  collapsible section on the landing screen holds a ready-made prompt
  (`byoAiPrompt` in `ImportBankStatement.jsx`, built from the group's own
  real category names) with a one-click copy button — paste it into
  whichever AI chat app you already use, attach your own redacted
  statement, paste back the CSV it hands you. That CSV asks for the same
  `Date,Description,Amount,Category` shape the rest of this pipeline
  already understands, so it goes through the identical parse →
  column-detection → review flow as an upload, not a separate code path.
  The `Category` column (recognized via `CATEGORY_ALIASES`) is also how a
  guess round-trips straight into `categoryId`, resolved by name against
  the group's real categories (`initialReviewEntry`) — a name that doesn't
  match falls back to blank, same as any uncategorized transaction. Same
  redaction warning as the PDF path applies, since a third-party chat app
  is seeing the statement either way.

#### Matching bank categories

A real bank's own category column is trusted, not re-guessed — but its
names essentially never match this app's own (different wording, often a
different language), so a one-time **"Match bank categories"** step runs
right after parsing, whenever the statement has at least one category name
(`categoryHint` — the same field the AI-chat path above sets) that doesn't
already match a group category and hasn't been matched before. Skipped for
a file with no category column, or once every name it has is already
matched.

`src/lib/bankCategoryMappings.js` remembers each choice per group,
localStorage-only (a device's own view of how a bank's wording maps to a
group's categories — not worth a database table or cross-device sync), so a
given bank's categories only ever need matching once per group, not once
per statement. A category resolved this way — exact match, a previous
mapping, or one just chosen — is never second-guessed by the AI suggestion
pass either (same guard that already protects an already-reviewed entry
from a stale late suggestion; see `runCategorySuggestions` in
`ImportBankStatement.jsx`). Choosing "Leave uncategorized" for a bank
category is remembered too, without blocking the AI pass from still
guessing at those.

#### Reviewing, pausing, and resuming

Every path lands on the same review flow: one transaction at a time, not a
single long list — a 200-row statement felt overwhelming as a flat list,
and one-at-a-time is also what makes pausing safe (below). Each card shows
the date, amount, an editable description (for when the bank's own wording
isn't what you'd want as a bill title), a category suggestion (the same AI
pass `/categorize` uses — CSV/Excel get this too, not just PDF, whenever an
AI service is configured), and a checkbox to include or skip it. Credits
(salary, refunds, incoming transfers) never get a card — they can't be
imported either way. A progress line ("47 of 180, 46 reviewed") and a
**← Back** button sit alongside Next/Finish, since going back to fix an
earlier card is expected, not an edge case.

Each transaction becomes a real bill the moment you move past its card —
not all at once at the end. That's what makes pausing genuinely safe:
closing the tab mid-statement loses nothing already confirmed, and Group
Settings' own import link turns into "Resume bank statement import — N of M
remaining" whenever one's unfinished (`bank_import_drafts` in schema.sql
holds the still-unreviewed transactions; a reviewed one isn't kept there
twice, since it's already a real bill by then). Only one import can be in
progress per group — starting another means resuming or discarding the
first from the wizard's own landing screen. Going back and changing an
already-committed transaction updates that same bill rather than creating a
second one alongside it (`src/lib/bankImportDrafts.js`,
`ImportBankStatement.jsx`'s own `confirmCurrentCard`).

<details>
<summary>Duplicate detection</summary>

Runs automatically, client-side, no AI needed — see
`src/lib/bankStatementDetection.js`.

(This used to also detect likely-recurring charges and offer a one-click
Subscription template, clustering transactions by merchant name and exact
amount. Removed — in practice it clustered unrelated purchases that shared
a payment processor's own generic descriptor rather than the actual
merchant, e.g. every PayPal-routed direct debit reading as "PayPal Europe
S.a.r.l. et Cie S.C.A" regardless of what was bought. That's not a
tunable false-positive rate — the statement's own description field
genuinely doesn't carry the distinguishing information in that case.
Setting up a Subscription by hand, from Group Settings, is unaffected.)

- **Duplicates**: a transaction matching an existing bill's merchant and
  amount within a few days defaults its checkbox off, flagged "possible
  duplicate" — for re-importing an overlapping statement period. Still
  editable, in case it's a false positive.
- **Already recorded elsewhere**: a transaction matching a bill's *amount*
  in one of the account's *other* groups, within the same few-day window,
  is flagged "already in \<Group\>?" — a shared expense (split with a
  friend, already a bill there) showing up on your own statement too.
  Deliberately amount + date only, no title match required — a shared
  bill's title has no reason to resemble the bank's own wording for the
  same charge.

</details>

## The in-app guide

`/guide` (also reachable from Settings as "How to Use", both rendering the
same `src/components/GuideSection.jsx`) is a searchable, topic-by-topic
guide covering the whole app — worth keeping in sync as features land.
Topics are grouped (Getting started, Bills & splitting, Settling up,
Sharing & importing your data, Stats, Group management, Your account);
browsing one group at a time uses the same `SettingsNav.jsx` rail the
account and Group Settings pages already use on the standalone `/guide`
page (room for a full second rail), and a horizontally scrollable row of
chips instead when embedded in Settings (`compact` prop — a second full
rail nested inside Settings' own measured out too cramped on a real
phone). Typing a search query bypasses both and flattens every group's
matching topics into one force-opened list, same as before either
existed. Each topic is still its own self-contained `<details>` entry —
keep new/changed ones short enough to stay skimmable; split a topic that's
grown long into two rather than letting it become another wall of text.

## Recaps, PDFs, and CSV

Every bill, every group's settle-up (that one's the share icon on the
group page, next to Stats and Settings), and every stats page has a single
**Share** button (`src/components/ShareButton.jsx`) with up to three
options, each only offered where it actually applies:

- **Share as text** — via the phone's native share sheet (falling back to
  clipboard on desktop), formatted with WhatsApp's own `*bold*`/`_italic_`
  syntax rather than markdown, since markdown wouldn't render there.
- **Download as PDF** — the browser's own print dialog, not a new dependency.
  Renders through a React portal into a dedicated `#print-root` sibling of
  `#root`, swapped visible via `@media print` — the fix for a real bug a
  `visibility: hidden` approach had (invisible content still reserved its
  full height, routinely producing a trailing blank page).
- **Export as CSV** (`src/lib/csv.js`) — a bill's own CSV is one row per
  item; a group's is its whole bill history. Used to be a second, separate
  button next to Share — folded into the same menu instead, since "share as
  a recap" and "export as a file" were really the same underlying action in
  a different format, not two different features.

`ShareButton` itself supports an icon-only mode (`icon`), used for the
group page's own trigger and both stats pages' own headers (next to their
"see graphs" icon) — the same component either way, just a glyph instead of
a text label, with its own props for which of the three options above
actually apply (`getText`/`title` gate the first two together;
`onExportCsv` gates the third independently, so any group can offer all
three at once).

A personal space's share icon offers the exact same three options as a real
group's — the underlying recap is just a different shape, since there's
nobody to owe or be owed. `formatPersonalSpaceRecap()`/
`PrintablePersonalSpaceRecap` share total spent, bill count, and a by-category
breakdown, built entirely from `bills`/`categories` already sitting in
`GroupView.jsx`'s own state (`GROUP_BILLS_SELECT` already carries each
item's `total_price`/`category_id`) rather than a fresh fetch the way
sharing one bill or a few selected ones does — `ShareButton`'s `getText` is
called synchronously, and "Download as PDF" needs its printable content
already in the DOM the instant `window.print()` fires, so neither has
anywhere to `await` an on-demand round-trip. A full itemized transcript
(needing each item's name/quantity, not just its total) stays exactly what
selecting bills and sharing them from the list itself is for.

### Importing from Splitwise

`/groups/:groupId/import` (linked from Group Settings → Data) reads a
Splitwise CSV export directly. Splitwise gives each row a **net balance** per person
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

`/groups/:groupId/categorize` (from Group Settings → Data) catches up an
import's uncategorized bills in two passes, both producing only *suggestions* — a
bill only changes once you review and confirm:

1. **Free and instant** — reads Splitwise's own original category back out
   of each bill's note and matches it against the group's own category
   names (exact match, then a small alias table for common near-misses like
   "Dining out" → "Eating out").
2. **AI, for whatever's left** — classifies by title alone, using whichever
   provider is already configured in Scan settings. Never invents a new
   category (only ever chooses from the group's existing list). Favors
   guessing over `null`: since every suggestion is a pre-fill a person
   reviews and can correct before anything is saved (here and on a bank
   statement import alike, see `src/lib/billCategorization/classifyPrompt.js`),
   a plausible guess is worth more than an empty one — `null` is reserved
   for a title with genuinely nothing to go on (pure noise, a bare
   reference number, an in-joke with no recognizable expense type), not
   just "not fully sure."

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
| `bank_import_drafts` | An in-progress bank-statement import's still-unreviewed transactions, one row per group, so it survives a closed tab (see "Importing a bank statement" above) |

The bill list groups under month/day date dividers, styled after Splitwise's
own activity feed (`groupItemsByDate()` in `src/lib/dateGroups.js`).
Settlement math lives entirely in `src/lib/settlement.js` — plain,
dependency-free JS worth a read; it never special-cases a real account vs. a
guest.

<details>
<summary>Guests, claiming, multiple payers, admin permissions, leaving a group</summary>

**Guests** — added from Group Settings → **Guests** with no account at all
(`group_members.user_id` null, just a `display_name`). Every table that
references "a person" points at `group_members.id`, so a guest works exactly
like a real account for splitting, fronting, and settling up. Removing one
just flips `active` off — restorable any time. **Deleting one permanently**
is admin-only and blocked server-side unless they're off every bill,
payment, and subscription first, checked table-by-table rather than
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
with whoever created it. Only the admin can remove someone *else*, from
Group Settings → **Members**; the role auto-passes to the longest-standing
remaining member if the admin leaves, or can be handed off directly from
that same tab. Guest management (add/rename/archive) is open to any active
member — it's not "removing a real person against their will," so it isn't
gated the same way.

**Leaving a group** — Group Settings → **Danger Zone → Leave group** (any
member, admin included) flips `group_members.active` to `false`; nothing is
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
- Group-level (shared) budgets, alongside the personal ones that
  exist today
- AI-assisted category suggestions during a scan itself
- Push notifications, once usage patterns make them worth the noise
- Item price tracking across visits — a real fuzzy-matching problem (item
  names from a scan aren't perfectly consistent between visits), not a
  simple lookup
- True multi-currency support (conversion within a bill/group), distinct
  from today's display-only currency picker
- A scheduled/background job for subscriptions, instead of the current
  open-the-app trigger
- More avatar icons added to the picker over time, beyond today's 16
- Let people upload their own SVG and turn it into an avatar icon, instead
  of picking only from the built-in set

## What's intentionally left simple (v1)

- No partial-share stepper UI ("I only had half a portion") — the `shares`
  column already supports it, just needs a control in `ItemRow`
- No push notifications for a group-mate's new bill (realtime *within* an
  open app already works)
- No receipt photo is kept after scanning, only the extracted items
- A departure snapshot's numbers are trusted from the client, not re-derived
  server-side — reasonable for a personal-use app, worth revisiting for
  less-trusted users
- Free OCR expects an item's name and price on the same line; a wrapped item
  name won't parse correctly for that line
- OpenAI and other providers aren't built, but would follow the existing
  `ReceiptParserStrategy` shape
- A subscription covers one payer and a fixed split only — switch a
  specific generated occurrence to Multiple payers by hand if needed
- Subscriptions generate on open, not on a schedule, so they can appear
  "late"
- Claim-guest links trust possession of the link, same model as the general
  group invite link
- PDF export goes through the browser's print dialog, not a one-tap download
- `admin_id` changes are only ever made through `transfer_admin()` in the
  app's own code — the RLS policy itself is a blanket per-row check, so it
  can't stop a raw API call from changing it directly
- Budgets only cover the current calendar month, no history view
- A snapshot recorded before category tracking existed has no category
  breakdown for its days, only the original totals
- The budget indicator only shows on Your Stats, not any single group's own
  stats page
- Cross-group category merging can rarely split into two entries if a
  category's exact casing changes elsewhere *after* a budget's been saved
  for it — re-saving it under the new casing fixes it
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
