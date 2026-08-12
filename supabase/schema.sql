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

-- `active` lets someone be removed from a group without deleting the row:
-- their historical bills/items/payments still reference their user_id
-- directly, so nothing breaks — they just stop being selectable for *new*
-- things, and lose access going forward. If they rejoin later (same invite
-- link, same account), it's the same row flipping back to active=true, so
-- all their history is automatically still theirs — never disconnected.
create table group_members (
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- ---------------------------------------------------------------------------
-- bills: one receipt / expense event. paid_by is whoever fronted the money.
-- default_buyer_ids is who new items on *this* bill get split with by
-- default (null/empty means "everyone currently active") — lets a
-- household set it to just the two people actually shopping today instead
-- of unchecking everyone else on every single item.
-- ---------------------------------------------------------------------------
create table bills (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  title text not null default 'New bill',
  note text,
  paid_by uuid references auth.users(id),
  default_buyer_ids uuid[],
  created_by uuid references auth.users(id),
  settled boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- items: one line on a bill, either typed manually or extracted by the
-- parse-receipt edge function from a photo.
-- ---------------------------------------------------------------------------
create table items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills(id) on delete cascade,
  name text not null,
  unit_price numeric(10,2) not null default 0,
  quantity numeric(10,2) not null default 1,
  total_price numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- item_shares: who is buying how much of an item. `shares` lets one person
-- be responsible for more than an equal split (e.g. they took 2 of the 3
-- units), matching the old app's per-buyer amount tracking.
-- ---------------------------------------------------------------------------
create table item_shares (
  item_id uuid not null references items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  shares numeric(10,2) not null default 1,
  primary key (item_id, user_id)
);

-- ---------------------------------------------------------------------------
-- payments: a recorded cash transfer between two group members, settling
-- some amount of what one owes the other. Separate from bills/items — this
-- is money moving between people directly, not a purchase.
-- ---------------------------------------------------------------------------
create table payments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  from_user uuid not null references auth.users(id),
  to_user uuid not null references auth.users(id),
  amount numeric(10,2) not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- departure_snapshots: a frozen personal record of someone's history in a
-- group, written the moment they leave/are removed (see remove_group_member
-- below), while they still have access to compute it. After that, RLS on
-- bills/items/item_shares cuts off their access to the group entirely — this
-- is what lets their account-wide stats page keep showing accurate numbers
-- for that group anyway, without granting them any ongoing visibility into
-- it. daily_totals is keyed by ISO date ('YYYY-MM-DD') -> {paid, consumed};
-- days nest cleanly into any week/month/year view with no approximation.
-- One row per (group, person) — leaving a second time overwrites it with a
-- fresh, complete recomputation rather than stacking duplicates.
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

-- ============================================================================
-- Row Level Security — every table is locked to "active members of the same
-- group". Someone removed from a group (active=false) loses access to it
-- going forward, but their profile stays visible to former groupmates (see
-- the profiles policy below) so their name still renders correctly on old
-- bills, items, and payments that reference them.
-- ============================================================================

alter table profiles enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table bills enable row level security;
alter table items enable row level security;
alter table item_shares enable row level security;
alter table payments enable row level security;
alter table departure_snapshots enable row level security;

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
-- active to false) and is also how a self-removal ("leave group") works.
create policy "members can view group rosters" on group_members
  for select using (
    user_id = auth.uid()
    or public.is_group_member(group_id)
  );

create policy "users can add themselves to a group" on group_members
  for insert with check (user_id = auth.uid());

create policy "members can update group rosters" on group_members
  for update using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));

-- bills / items / item_shares: gated on *active* group membership, walking
-- the chain down
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

create policy "members can view items" on items
  for select using (
    exists (
      select 1 from bills b join group_members gm on gm.group_id = b.group_id
      where b.id = items.bill_id and gm.user_id = auth.uid() and gm.active = true
    )
  );
create policy "members can manage items" on items
  for all using (
    exists (
      select 1 from bills b join group_members gm on gm.group_id = b.group_id
      where b.id = items.bill_id and gm.user_id = auth.uid() and gm.active = true
    )
  );

create policy "members can view item shares" on item_shares
  for select using (
    exists (
      select 1 from items i
      join bills b on b.id = i.bill_id
      join group_members gm on gm.group_id = b.group_id
      where i.id = item_shares.item_id and gm.user_id = auth.uid() and gm.active = true
    )
  );
create policy "members can manage item shares" on item_shares
  for all using (
    exists (
      select 1 from items i
      join bills b on b.id = i.bill_id
      join group_members gm on gm.group_id = b.group_id
      where i.id = item_shares.item_id and gm.user_id = auth.uid() and gm.active = true
    )
  );

-- payments: any active member can view and record payments within their own
-- group. Deliberately NOT restricted once someone leaves the group that
-- created them — a removed member's payment history stays intact and
-- visible to the group (is_group_member() checks the *viewer*, not who the
-- payment mentions).
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

-- ============================================================================
-- remove_group_member: deactivates someone's membership AND writes their
-- departure snapshot in one step. This has to be a SECURITY DEFINER
-- function rather than a plain client-side update, because the person doing
-- the removing (which might be someone removing a groupmate, not just
-- themselves) needs to write a snapshot row owned by the *other* person —
-- something the plain "users can update their own departure snapshots"
-- policy above deliberately does not allow on its own.
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
begin
  if not exists (
    select 1 from group_members
    where group_id = target_group_id and user_id = auth.uid() and active = true
  ) then
    raise exception 'Not authorized to remove members from this group';
  end if;

  update group_members
  set active = false
  where group_id = target_group_id and user_id = target_user_id;

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
-- create_group: creates a group AND adds the creator as its first member in
-- one atomic step. Doing this as two separate client-side inserts caused a
-- race against the "members can view their groups" policy below — the group
-- row existed but wasn't readable yet, since the membership row that grants
-- read access hadn't been written. This sidesteps that entirely.
-- ============================================================================
create function public.create_group(name text)
returns groups
language plpgsql
security definer
set search_path = public
as $$
declare
  g groups;
begin
  insert into groups (name, created_by) values (name, auth.uid()) returning * into g;
  insert into group_members (group_id, user_id) values (g.id, auth.uid());
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
begin
  select * into g from groups where invite_code = invite;

  if g.id is null then
    raise exception 'Invalid invite code';
  end if;

  insert into group_members (group_id, user_id, active)
  values (g.id, auth.uid(), true)
  on conflict (group_id, user_id) do update set active = true;

  return g;
end;
$$;

-- ============================================================================
-- Realtime: after running this file, go to
-- Database -> Replication -> supabase_realtime in the Supabase dashboard and
-- turn on replication for: bills, items, item_shares, payments, group_members.
-- That's what makes changes show up live on everyone's phone.
-- ============================================================================
