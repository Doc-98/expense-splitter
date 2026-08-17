# Spesa — Expense Splitter (PWA)

A phone-installable rebuild of the old JavaFX receipt splitter. Snap a photo of
a receipt (or type items in by hand), assign who's buying what, and see a
live, real-time settle-up with everyone in your group — no app store required.

## How it's built

- **Frontend**: React + Vite, packaged as an installable PWA (`vite-plugin-pwa`)
- **Backend**: [Supabase](https://supabase.com) — Postgres database, auth,
  realtime sync, all on the free tier to start
- **Receipt scanning**: no server, no shared API key, and no per-store parsing
  code required by default — see [Receipt scanning](#receipt-scanning) below
- **Settlement**: `src/lib/settlement.js` computes net balances per person and
  simplifies them into the minimum number of payments needed to settle up

Nothing here is deployed for you — this is real, runnable source code that
you deploy to your own free Supabase + Vercel/Netlify accounts, so *you* own
the data and the (tiny) hosting bill. Setup takes about 20 minutes the first
time.

## 1. Create your Supabase project

> **Updating an existing installation?** This version restructures how
> `bills`, `items`, and `payments` reference people — supporting guests with
> no account meant every "who is this about" column now points at a new
> `group_members.id` instead of a real account ID directly. There's no
> migration path from the previous schema; the cleanest move is resetting
> the database and starting fresh (see "Resetting the database" below).
> Fine for test/personal data; if you have data you actually need to keep,
> stop here and get in touch before running the new schema.

1. Go to [supabase.com](https://supabase.com) → New project (free tier is fine).
2. Once it's created, open **SQL Editor** → New query, paste in the entire
   contents of [`supabase/schema.sql`](supabase/schema.sql), and run it. This
   creates every table, security policy, and the profile-creation trigger.
3. Go to **Database → Replication → supabase_realtime** and toggle *on*
   realtime for these four tables: `bills`, `items`, `item_shares`,
   `group_members`. This is what makes edits show up live on every phone in
   the group without refreshing.
4. Go to **Authentication → Sign In / Providers** and make sure **Email** is
   enabled (it is by default). If you want magic-link sign-in to redirect
   back to your deployed app instead of `localhost`, add your deployed URL
   under **Authentication → URL Configuration → Site URL** once you've
   deployed the frontend (step 4 below).

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

Only needed if you're updating an existing installation to this version (see
the callout at the top) — skip this on a brand new project, just run
`schema.sql` directly.

Run this in the SQL Editor first, then run the entire `schema.sql` file
straight after it in a second query. This only removes the specific
tables/functions this project created — it deliberately avoids touching the
`public` schema itself or Supabase's own default permissions on it, which a
broader reset (`drop schema public cascade`) would wipe out and require
manually restoring.

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

- **Free OCR (default, zero setup)** — Tesseract.js runs OCR right on the
  phone, and `src/lib/receipt-parsing/lineParser.js` groups the recognized
  words into item/price pairs using their position on the page (name on the
  left, price on the right — the one layout convention nearly every receipt
  follows, regardless of store). No account, no key, no server, no per-store
  templates to maintain. Works best on a clear, reasonably well-lit photo of
  a typical two-column receipt; unusual layouts are where this is weakest.
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
scanning never fails outright even with nothing else set up.

The **old, server-side approach still exists** in
`supabase/functions/parse-receipt/` (calls Claude using a single shared,
hardcoded `ANTHROPIC_API_KEY` secret) but isn't wired up to anything
anymore — kept only as a reference/starting point if you'd rather run a
centralized paid option for your own household than rely on BYOK.

## How the data model works

| Table          | What it's for                                                   |
|----------------|-------------------------------------------------------------------|
| `profiles`     | Display name per user, auto-created on signup                    |
| `groups`       | A household / trip / friend circle, with a shareable invite code |
| `group_members`| Every *participant* a group can have — a real account (`user_id` set, name from `profiles`) or a guest with no account at all (`user_id` null, `display_name` set directly). `active=false` means they've left/been removed/archived — kept, not deleted. |
| `bills`        | One receipt/expense event, with a single `paid_by` (a `group_members.id` — real or guest — who fronted it) and an optional `default_buyer_ids` (who *new* items on this bill split with by default) |
| `items`        | One line item on a bill                                           |
| `item_shares`  | Who's responsible for how much of each item (`member_id` is a `group_members.id`; `shares` = weight, so someone taking 2 of 3 units owes double) |
| `payments`     | A recorded cash transfer between two participants (`from_member`/`to_member`, both `group_members.id`) |
| `departure_snapshots` | A frozen personal record of a *real account's* paid/consumed totals in a group they've left, day-by-day, plus their balance at that moment — see below |

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

### Leaving a group and personal stats

Removing a *real account* from a group (or leaving one yourself) doesn't
delete anything — it flips `group_members.active` to `false`, which is what
every RLS policy checks to decide access going forward. That person's old
bills, items, and payments stay exactly as they were; they just lose the
ability to query that group's live data again.

To keep their personal "Your stats" page accurate anyway, the
`remove_group_member()` function computes a `departure_snapshots` row for
them *at the moment of removal* — while they still have access — storing
their own paid/consumed totals bucketed by calendar day, plus their balance
right then. Day-level buckets are what let "by week / month / year" views
stay exactly correct for a departed group forever, without needing to keep
querying it: any coarser period is just the right days summed together, no
approximation. If they rejoin later, live data (which was never touched)
naturally covers everything again, snapshot included, and the account stats
page prefers live data whenever it's available.

## What's intentionally left simple (v1)

- One payer per bill (no split front-money between multiple payers yet)
- No UI yet for "I only had half a portion" style partial weights — the
  `shares` column already supports fractional/unequal shares, just needs a
  stepper control in `ItemRow` instead of a plain checkbox
- No push notifications when a group-mate adds a bill (realtime *within* the
  open app works today; background notifications would need a service worker
  + web push setup)
- No receipt photo is kept after scanning — only the extracted items are
  saved. Add a Supabase Storage upload in `ScanReceiptButton.jsx` if you'd
  like to keep the originals.
- Deleting a whole group isn't wired up in the UI yet — bills, payment
  records, and individual members can all be removed, the group itself can't
  be deleted yet.
- A departure snapshot's balance is trusted from the client rather than
  re-derived in SQL (see the comment above `remove_group_member` in
  `schema.sql`) — reasonable for a personal-use app since it's a display-only
  historical record, not the source of truth for any live balance, but worth
  knowing if this ever needs to hold up to less trusted users.
- The free OCR fallback expects an item's name and price to sit on the same
  line; a receipt that wraps a long item name onto its own line above the
  price won't parse correctly for that item. This is the honest tradeoff of
  "no per-store templates, ever" — it degrades gracefully rather than
  guessing wrong, but it does mean occasionally missing a line entirely.
- OpenAI and other providers aren't built yet, but would follow the exact
  same `ReceiptParserStrategy` shape as the four that already exist.
- No "claim this guest profile" flow yet — a guest stays a guest
  permanently for now. The schema (nullable `user_id` on `group_members`)
  was deliberately designed to leave this open, but the actual claim/invite
  UI isn't built.
- Recaps are plain shareable text only, not a downloadable file (PDF, etc.)
  — a deliberate v1 choice, since it matches "tell people what they owe"
  more directly and needed no new dependency. Worth adding a real file
  export later if that turns out to matter more than expected.

## Security notes

- Every table has row-level security scoped to "members of the same group" —
  see the policies at the bottom of `schema.sql`.
- The Anthropic API key only ever lives in the Supabase Edge Function's
  secrets — it's never bundled into the frontend.
- Group names and invite codes are only visible to members; joining a new
  group goes through the `join_group_by_code()` Postgres function so the
  `groups` table itself doesn't need to be publicly readable.
