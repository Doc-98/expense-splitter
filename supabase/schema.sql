-- ============================================================================
-- Spesa — database schema
-- Run this in your Supabase project: SQL Editor -> New query -> paste -> Run.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles: one row per signed-up user, auto-created on signup (see trigger
-- below). Lets us show a real display name instead of a raw email/UUID.
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- groups: a household / trip / friend circle. invite_code is the shareable
-- "password" — anyone with the link can join via the join_group_by_code() RPC.
-- ---------------------------------------------------------------------------
create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- group_members: every "person" a bill/item/payment can be about — a real
-- signed-up account (user_id set, display_name comes from profiles) OR a
-- guest with no account at all (user_id null, display_name set directly on
-- this row). Exactly one of the two is always set — see the check
-- constraint below. This is the one column that changed shape for every
-- other table: bills.paid_by, item_shares.member_id, and
-- payments.from_member/to_member all point at group_members.id now,
-- instead of pointing at a real account directly — which is what makes a
-- guest usable everywhere a real member is, with zero changes needed to the
-- settlement math itself (it already just sums things up by whatever ID
-- it's given).
--
-- `active` still means "removed/left" for real members exactly as before
-- (see departure_snapshots below); for a guest it just means "archived,
-- don't offer them for new things" — a guest never had login-gated access
-- to lose, so there's nothing to preserve a snapshot of.
--
-- Keeping user_id nullable (rather than never reusing this row) is also
-- what leaves room for a future "claim this guest profile" flow: someone
-- signing up for real later would just be this same row gaining a user_id,
-- not a fresh identity that needs their old history relinked to it.
-- claim_token is that flow's actual mechanism — generated lazily (see
-- get_claim_preview/claim_guest_profile below) only when someone actually
-- requests a claim link for a specific guest, cleared the moment it's
-- used so it can't be replayed.
create table group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  display_name text,
  active boolean not null default true,
  claim_token uuid,
  created_by uuid references auth.users(id),
  joined_at timestamptz not null default now(),
  constraint group_members_person_shape check (
    (user_id is not null and display_name is null)
    or (user_id is null and display_name is not null)
  ),
  unique (group_id, user_id)
);

-- admin_id has to be added after group_members exists — groups.admin_id
-- references group_members(id), and group_members.group_id references
-- groups(id), so neither table can be created with the other's FK already
-- in place. The one admin per group (not "any active member," which is how
-- removal used to work) can kick someone else out; anyone can still remove
-- themselves. See remove_group_member() and transfer_admin() below for how
-- that's enforced, and how the role automatically passes to the
-- longest-standing remaining member if the admin leaves.
alter table groups add column admin_id uuid references group_members(id);

-- ---------------------------------------------------------------------------
-- categories: a small, per-group list of spending categories (Groceries,
-- Eating out, etc), seeded with a starter set the moment a group is
-- created (see create_group() below) so tagging is useful immediately
-- without any setup. Scoped per-group rather than shared globally, same
-- reasoning as everything else here — a household's categories shouldn't
-- leak into an unrelated trip group.
-- ---------------------------------------------------------------------------
create table categories (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- recurring_bills: a template for a bill that repeats (rent, a
-- subscription, a recurring utility) — one fixed amount per occurrence,
-- covering the common "same amount every time" case rather than trying to
-- templatize a fully itemized receipt. A template represents a single
-- payer and a fixed set of people splitting it each time; a specific
-- occurrence can always be edited normally afterward (including switching
-- it to multiple payers) since once created it's just an ordinary bill.
--
-- next_due_date advances every time an occurrence is generated (see
-- processDueRecurringBills() in recurringBills.js) — this happens
-- client-side, opportunistically, whenever someone opens the group, rather
-- than via a server-side scheduled job. That's a deliberate choice: this
-- app has no scheduled/background infrastructure anywhere else, and
-- introducing one (a cron job, an Edge Function) just for this would be a
-- meaningfully bigger commitment than the feature calls for. The tradeoff
-- is worth naming plainly: if a group goes quiet for a while, its overdue
-- bills simply catch up — all of them, in order — the next time anyone
-- opens it, rather than appearing exactly on schedule in the background.
-- day_of_month is only meaningful for 'monthly'/'yearly' frequency, and is
-- clamped against each landing month's actual length rather than drifting
-- permanently short after a month like February (see advanceDate() in
-- recurringBills.js, and its tests, for exactly how).
-- ---------------------------------------------------------------------------
create table recurring_bills (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  title text not null,
  note text,
  amount numeric(10,2) not null,
  category_id uuid references categories(id) on delete set null,
  paid_by uuid references group_members(id),
  split_member_ids uuid[],
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  day_of_month integer,
  next_due_date date not null,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- bills: one receipt / expense event. paid_by is whoever fronted the money
-- — a group_members.id, so a guest can front the money just as well as a
-- real member can. default_buyer_ids is who new items on *this* bill get
-- split with by default (null/empty means "everyone currently active") —
-- lets a household set it to just the two people actually shopping today
-- instead of unchecking everyone else on every single item. category_id is
-- the bill-level default category — the common case, one tap categorizes
-- the whole receipt; individual items can override it (see items.category_id
-- below). "on delete set null" on both category columns is deliberate:
-- deleting a category should just uncategorize whatever used it, never
-- block the deletion or (far worse) cascade into deleting actual bills.
-- ---------------------------------------------------------------------------
create table bills (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  title text not null default 'New bill',
  note text,
  paid_by uuid references group_members(id),
  default_buyer_ids uuid[],
  category_id uuid references categories(id) on delete set null,
  recurring_bill_id uuid references recurring_bills(id) on delete set null,
  created_by uuid references auth.users(id),
  settled boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- items: one line on a bill, either typed manually or extracted by a
-- receipt scan. category_id is null by default, meaning "inherit the
-- bill's category" — only set when a specific item genuinely belongs
-- somewhere else (a gift bought during a grocery run).
-- ---------------------------------------------------------------------------
create table items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills(id) on delete cascade,
  name text not null,
  unit_price numeric(10,2) not null default 0,
  quantity numeric(10,2) not null default 1,
  total_price numeric(10,2) not null default 0,
  category_id uuid references categories(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- item_shares: who is buying how much of an item. member_id is a
-- group_members.id (real or guest). `shares` lets one person be
-- responsible for more than an equal split (e.g. they took 2 of the 3
-- units), matching the old app's per-buyer amount tracking.
-- ---------------------------------------------------------------------------
create table item_shares (
  item_id uuid not null references items(id) on delete cascade,
  member_id uuid not null references group_members(id) on delete cascade,
  shares numeric(10,2) not null default 1,
  primary key (item_id, member_id)
);

-- ---------------------------------------------------------------------------
-- bill_payers: when a bill was fronted by more than one person, one row per
-- payer with exactly how much *they* contributed. bills.paid_by covers the
-- common single-payer case on its own; a bill only has rows here once it's
-- been switched to "multiple payers" in the UI, at which point paid_by is
-- cleared and this table becomes the source of truth for who fronted the
-- money. Amounts here are expected to sum to the bill's total — enforced in
-- the app (a red validation error blocks saving otherwise), not by a
-- database constraint, since the total itself lives on items that can
-- change after the fact.
-- ---------------------------------------------------------------------------
create table bill_payers (
  bill_id uuid not null references bills(id) on delete cascade,
  member_id uuid not null references group_members(id),
  amount numeric(10,2) not null,
  primary key (bill_id, member_id)
);

-- ---------------------------------------------------------------------------
-- payments: a recorded cash transfer between two group members (real or
-- guest), settling some amount of what one owes the other. Separate from
-- bills/items — this is money moving between people directly, not a
-- purchase.
-- ---------------------------------------------------------------------------
create table payments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  from_member uuid not null references group_members(id),
  to_member uuid not null references group_members(id),
  amount numeric(10,2) not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- departure_snapshots: a frozen personal record of a *real account's*
-- history in a group, written the moment they leave/are removed (see
-- remove_group_member below), while they still have access to compute it.
-- This is deliberately unaffected by guests existing at all — a guest never
-- had their own login-gated access to a group in the first place, so
-- there's no "loss of access" to compensate for, and archiving one is just
-- a plain update to group_members.active with no snapshot involved.
-- daily_totals is keyed by ISO date ('YYYY-MM-DD') -> {paid, consumed,
-- categories}; days nest cleanly into any week/month/year view with no
-- approximation. categories is itself {category name -> consumed amount}
-- for that day — paid has no category breakdown, nothing else in the app
-- tracks paid-by-category either. A snapshot written before this breakdown
-- existed just has no categories key on its days; readers (see
-- sumCategoryDailyInRange() in src/lib/timeRange.js) treat that as
-- contributing nothing, not an error. One row per (group, person) —
-- leaving a second time overwrites it with a fresh, complete recomputation
-- rather than stacking duplicates.
-- ---------------------------------------------------------------------------
create table departure_snapshots (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  group_name text not null,
  left_at timestamptz not null default now(),
  balance numeric(10,2) not null default 0,
  balance_settled boolean not null default false,
  daily_totals jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

-- ---------------------------------------------------------------------------
-- spending_thresholds: a personal monthly budget per category *name*, not
-- per category_id — deliberately. Every group has its own separate
-- categories row even for the same name ("Groceries" in Group A and
-- "Groceries" in Group B are two different UUIDs), but a personal budget is
-- about total spending on "Groceries" everywhere you spend, not any one
-- group's specific row. The app is what guarantees category_name is always
-- the deduped, canonical name it already decided on when merging same-named
-- categories together (see mergeCategoriesByName() in src/lib/categories.js)
-- — this table itself does no case-folding, so the plain unique constraint
-- below is enough. One row per (user, category_name); a category with no
-- row here simply has no budget tracked. Always monthly — see the Thresholds
-- page for why a single fixed period was chosen over a selector.
-- ---------------------------------------------------------------------------
create table spending_thresholds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_name text not null,
  amount numeric(10,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (user_id, category_name)
);

-- ---------------------------------------------------------------------------
-- Indexes: Postgres never auto-indexes a foreign key column, only primary
-- keys and explicit unique constraints — item_shares/bill_payers already
-- get one for free since their own primary keys lead with item_id/bill_id,
-- but every column below is a plain FK with no index of its own otherwise.
-- Each one is hit by a plain `.eq('group_id', …)` / `.eq('user_id', …)` /
-- `.eq('bill_id', …)` on every group-page, stats, or graphs load — without
-- an index that's a full sequential scan of the *entire* table, across
-- every group and user, not just the one being asked for. See
-- supabase/migrations/add_indexes.sql for the same statements as a
-- standalone migration for an already-deployed database.
-- ---------------------------------------------------------------------------
create index bills_group_id_idx on bills (group_id);
create index items_bill_id_idx on items (bill_id);
create index payments_group_id_idx on payments (group_id);
create index categories_group_id_idx on categories (group_id);
create index recurring_bills_group_id_idx on recurring_bills (group_id);
create index group_members_user_id_idx on group_members (user_id);
create index departure_snapshots_user_id_idx on departure_snapshots (user_id);

-- ============================================================================
-- Row Level Security — every table is locked to "active [real-account]
-- members of the same group". Access checks are entirely about *who is
-- asking* (always a real authenticated account — a guest never asks
-- anything, they're only ever data), which is exactly why adding guests
-- required zero changes to any policy's actual logic below beyond one new
-- insert policy for creating them in the first place.
-- ============================================================================

alter table profiles enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table categories enable row level security;
alter table recurring_bills enable row level security;
alter table bills enable row level security;
alter table items enable row level security;
alter table item_shares enable row level security;
alter table bill_payers enable row level security;
alter table payments enable row level security;
alter table departure_snapshots enable row level security;
alter table spending_thresholds enable row level security;

-- Helper: checks *active* group membership from inside a SECURITY DEFINER
-- function, so it runs with the function owner's privileges and doesn't
-- re-trigger group_members' own RLS policy. Needed because that policy
-- itself has to check "is this user a member of this group" — if it did
-- that with a plain subquery against group_members, Postgres would recurse
-- into the same policy infinitely ("infinite recursion detected in policy
-- for relation group_members"). Other tables' policies below query
-- group_members directly (not a problem — they're a different table's
-- policy), but group_members' own policy must go through this function.
create function public.is_group_member(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from group_members
    where group_id = target_group_id
      and user_id = auth.uid()
      and active = true
  );
$$;

-- profiles: see your own profile, and profiles of anyone you have EVER
-- shared a group with — deliberately not filtered to active membership, so
-- a removed person's name still resolves on old bills for the people who
-- remain in the group.
create policy "profiles are visible to groupmates" on profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1 from group_members gm1
      join group_members gm2 on gm1.group_id = gm2.group_id
      where gm1.user_id = auth.uid() and gm2.user_id = profiles.id
    )
  );

create policy "users can update their own profile" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- groups: only visible to active members. Joining a new group happens
-- through the join_group_by_code() function below (so the invite_code
-- doesn't need to be publicly selectable).
create policy "members can view their groups" on groups
  for select using (
    exists (
      select 1 from group_members gm
      where gm.group_id = groups.id and gm.user_id = auth.uid() and gm.active = true
    )
  );

create policy "authenticated users can create groups" on groups
  for insert with check (created_by = auth.uid());

create policy "members can rename their group" on groups
  for update using (public.is_group_member(id)) with check (public.is_group_member(id));

-- group_members: see membership rows for groups you're (still) an active
-- member of, or your own row regardless (so a removed person can still see
-- that they were removed, rather than the row just vanishing on them).
-- Active members can update rosters — used for removing someone (flip
-- active to false), self-removal ("leave group"), and archiving/renaming a
-- guest, all the same way.
create policy "members can view group rosters" on group_members
  for select using (
    user_id = auth.uid()
    or public.is_group_member(group_id)
  );

create policy "users can add themselves to a group" on group_members
  for insert with check (user_id = auth.uid());

-- A guest row is never self-inserted (a guest never authenticates at all)
-- — an active member adds one on the group's behalf instead.
create policy "members can add guests to their group" on group_members
  for insert with check (
    user_id is null
    and display_name is not null
    and public.is_group_member(group_id)
  );

create policy "members can update group rosters" on group_members
  for update using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));

-- categories: open to any active member, same as guest management — this
-- is shared group configuration, not the "only the admin can remove a
-- person" concern that real-member removal is specifically about.
create policy "members can view categories" on categories
  for select using (public.is_group_member(group_id));
create policy "members can manage categories" on categories
  for all using (public.is_group_member(group_id));

-- recurring_bills: same reasoning as categories — shared group
-- configuration any active member can set up or adjust, not a
-- removing-a-person concern.
create policy "members can view recurring bills" on recurring_bills
  for select using (public.is_group_member(group_id));
create policy "members can manage recurring bills" on recurring_bills
  for all using (public.is_group_member(group_id));

-- bills / items / item_shares: gated on *active* group membership, walking
-- the chain down. Untouched by guests existing — these checks are about
-- who's asking (always a real account), never about who a row is *about*.
create policy "members can view bills" on bills
  for select using (
    exists (
      select 1 from group_members gm
      where gm.group_id = bills.group_id and gm.user_id = auth.uid() and gm.active = true
    )
  );
create policy "members can create bills" on bills
  for insert with check (
    exists (
      select 1 from group_members gm
      where gm.group_id = bills.group_id and gm.user_id = auth.uid() and gm.active = true
    )
  );
create policy "members can update bills" on bills
  for update using (
    exists (
      select 1 from group_members gm
      where gm.group_id = bills.group_id and gm.user_id = auth.uid() and gm.active = true
    )
  );
create policy "members can delete bills" on bills
  for delete using (
    exists (
      select 1 from group_members gm
      where gm.group_id = bills.group_id and gm.user_id = auth.uid() and gm.active = true
    )
  );

-- These three all route through is_group_member() (a STABLE function)
-- rather than a hand-rolled join, and that's deliberate, not just style:
-- called this way, repeated invocations with the same group_id within one
-- query become Memoize candidates, so Postgres evaluates the membership
-- check once per distinct group rather than re-deriving it via a fresh
-- bills/group_members join on every single item/share/payer row. On a
-- group with a real amount of history (the case that actually surfaced
-- this — ~1100 bills, ~2150 items) the join-per-row version measured
-- ~9s for the bill list's full nested load (well past a statement
-- timeout); this version measures ~340ms for the exact same result set.
-- Semantics are identical either way — same active-membership check.
create policy "members can view items" on items
  for select using (
    public.is_group_member((select b.group_id from bills b where b.id = items.bill_id))
  );
create policy "members can manage items" on items
  for all using (
    public.is_group_member((select b.group_id from bills b where b.id = items.bill_id))
  );

create policy "members can view item shares" on item_shares
  for select using (
    public.is_group_member((select b.group_id from items i join bills b on b.id = i.bill_id where i.id = item_shares.item_id))
  );
create policy "members can manage item shares" on item_shares
  for all using (
    public.is_group_member((select b.group_id from items i join bills b on b.id = i.bill_id where i.id = item_shares.item_id))
  );

create policy "members can view bill payers" on bill_payers
  for select using (
    public.is_group_member((select b.group_id from bills b where b.id = bill_payers.bill_id))
  );
create policy "members can manage bill payers" on bill_payers
  for all using (
    public.is_group_member((select b.group_id from bills b where b.id = bill_payers.bill_id))
  );

-- payments: any active member can view and record payments within their own
-- group — including ones involving a guest, since is_group_member() checks
-- the *viewer*, never who the payment is between.
create policy "members can view payments" on payments
  for select using (public.is_group_member(group_id));

create policy "members can record payments" on payments
  for insert with check (public.is_group_member(group_id));

create policy "members can delete payments" on payments
  for delete using (public.is_group_member(group_id));

-- departure_snapshots: strictly personal — only ever visible to and
-- editable by the person it belongs to. Writing a new snapshot happens
-- through remove_group_member() below (since the person removing someone
-- else needs to write it on their behalf); the "mark settled" toggle is a
-- plain update the owner does themselves.
create policy "users can view their own departure snapshots" on departure_snapshots
  for select using (user_id = auth.uid());

create policy "users can update their own departure snapshots" on departure_snapshots
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- spending_thresholds: strictly personal, same as departure_snapshots —
-- nobody but the owner ever reads or writes their own budget figures, and
-- unlike departure_snapshots there's no "someone else writes it on my
-- behalf" case, so this is a plain full set of CRUD policies rather than
-- select+update only.
create policy "users can view their own thresholds" on spending_thresholds
  for select using (user_id = auth.uid());

create policy "users can add their own thresholds" on spending_thresholds
  for insert with check (user_id = auth.uid());

create policy "users can update their own thresholds" on spending_thresholds
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "users can delete their own thresholds" on spending_thresholds
  for delete using (user_id = auth.uid());

-- ============================================================================
-- remove_group_member: deactivates a *real account's* membership AND writes
-- their departure snapshot in one step. Never used for guests — archiving
-- a guest is just a plain update to group_members.active (see the update
-- policy above), since there's no access to lose and so nothing to
-- snapshot. Has to be a SECURITY DEFINER function rather than a plain
-- client-side update, because the person doing the removing (which might
-- be someone removing a groupmate, not just themselves) needs to write a
-- snapshot row owned by the *other* person — something the plain "users
-- can update their own departure snapshots" policy above deliberately does
-- not allow on its own.
--
-- Only the current admin can remove someone *else*; anyone can remove
-- themselves (leave). If the admin is the one leaving, the role
-- automatically passes to whoever's been in the group longest among the
-- remaining active real members — deterministic, no group is ever left
-- without an admin as long as a real member remains in it.
--
-- The balance and daily_totals numbers are computed client-side (reusing
-- the exact same, already-tested settlement.js math) and passed in, rather
-- than re-derived here in SQL — this is a personal, display-only historical
-- record, not the source of truth for any live balance, so trusting the
-- caller's arithmetic here is a reasonable trade for not maintaining a
-- second implementation of the settlement math in PL/pgSQL.
-- ============================================================================
create function public.remove_group_member(
  target_group_id uuid,
  target_user_id uuid,
  group_name text,
  snapshot_balance numeric,
  snapshot_daily jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_participant_id uuid;
  target_participant_id uuid;
  current_admin_id uuid;
  next_admin_id uuid;
begin
  select id into caller_participant_id from group_members
    where group_id = target_group_id and user_id = auth.uid() and active = true;

  if caller_participant_id is null then
    raise exception 'Not authorized to remove members from this group';
  end if;

  select id into target_participant_id from group_members
    where group_id = target_group_id and user_id = target_user_id;

  select admin_id into current_admin_id from groups where id = target_group_id;

  if caller_participant_id <> target_participant_id and caller_participant_id <> current_admin_id then
    raise exception 'Only the group admin can remove other members';
  end if;

  update group_members
  set active = false
  where group_id = target_group_id and user_id = target_user_id;

  if target_participant_id = current_admin_id then
    select id into next_admin_id from group_members
      where group_id = target_group_id
        and active = true
        and user_id is not null
        and id <> target_participant_id
      order by joined_at asc
      limit 1;

    update groups set admin_id = next_admin_id where id = target_group_id;
  end if;

  insert into departure_snapshots (group_id, user_id, group_name, left_at, balance, daily_totals)
  values (target_group_id, target_user_id, group_name, now(), snapshot_balance, snapshot_daily)
  on conflict (group_id, user_id) do update
    set group_name = excluded.group_name,
        left_at = excluded.left_at,
        balance = excluded.balance,
        daily_totals = excluded.daily_totals,
        balance_settled = false;
end;
$$;

-- ============================================================================
-- transfer_admin: hands the admin role to another active real member.
-- Only the current admin can call this — enforced here, not just left to
-- the general "members can rename their group" policy, since that policy
-- (being a blanket per-row check, not a per-column one) would otherwise
-- let any member overwrite admin_id directly. This function is the one
-- sanctioned path the app itself ever uses to change it.
-- ============================================================================
create function public.transfer_admin(target_group_id uuid, new_admin_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_participant_id uuid;
  current_admin_id uuid;
begin
  select id into caller_participant_id from group_members
    where group_id = target_group_id and user_id = auth.uid() and active = true;

  select admin_id into current_admin_id from groups where id = target_group_id;

  if caller_participant_id is null or caller_participant_id <> current_admin_id then
    raise exception 'Only the current admin can transfer this role';
  end if;

  if not exists (
    select 1 from group_members
    where id = new_admin_id and group_id = target_group_id and active = true and user_id is not null
  ) then
    raise exception 'That person is not an active member of this group';
  end if;

  update groups set admin_id = new_admin_id where id = target_group_id;
end;
$$;

-- ============================================================================
-- delete_guest_permanently: hard-deletes an *archived* guest's
-- group_members row — unlike every other "guest is gone" path (see
-- setGuestActive in members.js), this can't be undone, so it's both
-- admin-gated and only allowed once the guest has zero history anywhere
-- in the group: not a bill's paid_by, not a bill_payers row, not an
-- item_shares row, not a payment on either side, not referenced by a
-- recurring template.
--
-- That last check matters more than it looks. bills.paid_by, bill_payers,
-- and payments all reference group_members.id with a plain (non-cascading)
-- foreign key, so a raw delete against any of those would simply fail —
-- annoying, but safe. item_shares.member_id is declared `on delete
-- cascade`, though, specifically so deleting an *item* cleans up its own
-- shares; deleting a *person* through that same cascade would instead
-- silently vanish their share off of someone else's item, leaving its
-- total_price divided among fewer people and quietly inflating what
-- everyone else still on it owes — no error, just a wrong number the next
-- time anyone looks. Requiring zero references everywhere, rather than
-- leaning on whichever tables happen to have a blocking FK, is what
-- actually makes this safe rather than safe-by-accident.
--
-- Restricted to an *archived* guest (active = false) on top of all that —
-- one more small guard against deleting someone still genuinely part of
-- the group's day-to-day, on the theory that "remove, then delete" is a
-- deliberate two-step you had to mean, not "delete" alone catching
-- somebody active by mistake.
-- ============================================================================
create function public.delete_guest_permanently(target_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  target_user_id uuid;
  target_active boolean;
  caller_participant_id uuid;
  current_admin_id uuid;
  has_history boolean;
begin
  select group_id, user_id, active into target_group_id, target_user_id, target_active
    from group_members where id = target_member_id;

  if target_group_id is null then
    raise exception 'Guest not found';
  end if;

  if target_user_id is not null then
    raise exception 'Only guests can be permanently deleted';
  end if;

  if target_active then
    raise exception 'Remove this guest before deleting them permanently';
  end if;

  select id into caller_participant_id from group_members
    where group_id = target_group_id and user_id = auth.uid() and active = true;

  select admin_id into current_admin_id from groups where id = target_group_id;

  if caller_participant_id is null or caller_participant_id <> current_admin_id then
    raise exception 'Only the group admin can permanently delete a guest';
  end if;

  select
    exists(select 1 from bills where paid_by = target_member_id)
    or exists(select 1 from bill_payers where member_id = target_member_id)
    or exists(select 1 from item_shares where member_id = target_member_id)
    or exists(select 1 from payments where from_member = target_member_id or to_member = target_member_id)
    or exists(
      select 1 from recurring_bills
      where paid_by = target_member_id or target_member_id = any(split_member_ids)
    )
  into has_history;

  if has_history then
    raise exception 'This guest is still on at least one bill, payment, or recurring template — remove them from those first';
  end if;

  delete from group_members where id = target_member_id;
end;
$$;

-- ============================================================================
-- delete_all_group_bills: wipes every bill in a group in one step, optionally
-- taking its payment (settle-up) history along with it.
--
-- Has to be a SECURITY DEFINER function rather than a plain client-side
-- `delete from bills where group_id = ...` — the existing "members can
-- delete bills" policy deliberately still lets any active member delete a
-- single bill, or a chosen handful, same as always; only wiping a group's
-- *entire* bill history in one action is admin-gated, on the theory that
-- "some remaining trace to dispute" is a much smaller ask of trust than
-- "everything is gone." The client decides *how* this gets invoked — the
-- Danger Zone button, or a bulk selection that happens to cover every bill
-- currently in the group — this function doesn't know or care which; it
-- just enforces the one rule that actually matters. Deleting one bill at a
-- time down to zero (including the literal last bill via the ordinary
-- per-bill delete) is deliberately left alone — this only gates the
-- explicit "delete everything at once" action, not an incidental empty
-- group arrived at one bill at a time.
--
-- delete_payments defaults to false so a plain "delete every bill" call
-- (from whichever entry point) never silently takes the settle-up ledger
-- with it unless that was actually asked for.
-- ============================================================================
create function public.delete_all_group_bills(target_group_id uuid, delete_payments boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_participant_id uuid;
  current_admin_id uuid;
begin
  select id into caller_participant_id from group_members
    where group_id = target_group_id and user_id = auth.uid() and active = true;

  select admin_id into current_admin_id from groups where id = target_group_id;

  if caller_participant_id is null or caller_participant_id <> current_admin_id then
    raise exception 'Only the group admin can delete every bill in a group';
  end if;

  delete from bills where group_id = target_group_id;

  if delete_payments then
    delete from payments where group_id = target_group_id;
  end if;
end;
$$;

-- ============================================================================
-- create_group: creates a group, adds the creator as its first member, and
-- seeds a starter set of categories, all in one atomic step. Doing the
-- group/membership part as two separate client-side inserts caused a race
-- against the "members can view their groups" policy above — the group row
-- existed but wasn't readable yet, since the membership row that grants
-- read access hadn't been written. This sidesteps that entirely. The
-- starter categories exist so tagging is useful the moment a group exists,
-- with no setup required — someone can rename, delete, or add to them
-- freely afterward from Group Settings; nothing here is fixed in place.
-- ============================================================================
create function public.create_group(name text)
returns groups
language plpgsql
security definer
set search_path = public
as $$
declare
  g groups;
  new_member_id uuid;
begin
  insert into groups (name, created_by) values (name, auth.uid()) returning * into g;
  insert into group_members (group_id, user_id) values (g.id, auth.uid()) returning id into new_member_id;
  update groups set admin_id = new_member_id where id = g.id;
  g.admin_id := new_member_id;

  insert into categories (group_id, name, color) values
    (g.id, 'Groceries', '#4a86e8'),
    (g.id, 'Eating out', '#e69138'),
    (g.id, 'Household', '#6aa84f'),
    (g.id, 'Bills & utilities', '#a479e2'),
    (g.id, 'Transport', '#45818e'),
    (g.id, 'Health', '#cc4125'),
    (g.id, 'Other', '#999999');

  return g;
end;
$$;

-- ============================================================================
-- join_group_by_code: lets someone who isn't a member yet (or who left and
-- is coming back) redeem an invite code, without needing broad SELECT
-- access to the groups table. If they already have a group_members row
-- (they were removed or left before), this just reactivates it — same row,
-- same history, nothing to relink.
-- ============================================================================
create function public.join_group_by_code(invite text)
returns groups
language plpgsql
security definer
set search_path = public
as $$
declare
  g groups;
  participant_id uuid;
begin
  select * into g from groups where invite_code = invite;

  if g.id is null then
    raise exception 'Invalid invite code';
  end if;

  insert into group_members (group_id, user_id, active)
  values (g.id, auth.uid(), true)
  on conflict (group_id, user_id) do update set active = true
  returning id into participant_id;

  -- Safety net: if the group somehow has no admin (every real member left
  -- at some point), whoever joins next becomes admin rather than the group
  -- staying permanently unadministered.
  if g.admin_id is null then
    update groups set admin_id = participant_id where id = g.id;
    g.admin_id := participant_id;
  end if;

  return g;
end;
$$;

-- ============================================================================
-- get_claim_preview / claim_guest_profile: the "claim this guest profile"
-- flow — a guest's row already has everything a real member's row has
-- except a user_id (see the comment above group_members), so claiming is
-- just that row gaining one, not a migration of history from one identity
-- to another.
--
-- A claim link is generated per-guest, on request, from Group Settings
-- (see requestClaimLink() in members.js) — never shown to the whole group
-- the way the general invite link is, specifically so claiming someone
-- else's guest identity requires having been sent *that specific* link,
-- not just being in the group. get_claim_preview lets the claim page show
-- who/which group *before* signing in commits to anything, without needing
-- the caller to already be a member (the normal group_members SELECT
-- policy requires that, which is exactly why this needs to be its own
-- SECURITY DEFINER function rather than a plain client-side query).
-- claim_guest_profile clears the token the moment it's used, so a claim
-- link only ever works once.
-- ============================================================================
create function public.get_claim_preview(token uuid)
returns table(guest_name text, group_name text)
language sql
security definer
set search_path = public
stable
as $$
  select gm.display_name, g.name
  from group_members gm
  join groups g on g.id = gm.group_id
  where gm.claim_token = token and gm.user_id is null;
$$;

create function public.claim_guest_profile(token uuid)
returns groups
language plpgsql
security definer
set search_path = public
as $$
declare
  target_member group_members;
  g groups;
begin
  select * into target_member from group_members where claim_token = token and user_id is null;

  if target_member.id is null then
    raise exception 'That claim link is invalid or has already been used.';
  end if;

  if exists (
    select 1 from group_members
    where group_id = target_member.group_id and user_id = auth.uid()
  ) then
    raise exception 'You are already a member of this group.';
  end if;

  update group_members
  set user_id = auth.uid(), display_name = null, claim_token = null, active = true
  where id = target_member.id;

  select * into g from groups where id = target_member.group_id;
  return g;
end;
$$;

-- ============================================================================
-- Realtime: after running this file, go to
-- Database -> Replication -> supabase_realtime in the Supabase dashboard and
-- turn on replication for: bills, items, item_shares, bill_payers, payments,
-- group_members.
-- That's what makes changes show up live on everyone's phone.
-- ============================================================================
