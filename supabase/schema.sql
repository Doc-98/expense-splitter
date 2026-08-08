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

create table group_members (
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- ---------------------------------------------------------------------------
-- bills: one receipt / expense event. paid_by is whoever fronted the money.
-- ---------------------------------------------------------------------------
create table bills (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  title text not null default 'New bill',
  paid_by uuid references auth.users(id),
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

-- ============================================================================
-- Row Level Security — every table is locked to "members of the same group"
-- ============================================================================

alter table profiles enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table bills enable row level security;
alter table items enable row level security;
alter table item_shares enable row level security;

-- Helper: checks group membership from *inside* a SECURITY DEFINER function,
-- so it runs with the function owner's privileges and doesn't re-trigger
-- group_members' own RLS policy. Needed because that policy itself has to
-- check "is this user a member of this group" — if it did that with a plain
-- subquery against group_members, Postgres would recurse into the same
-- policy infinitely ("infinite recursion detected in policy for relation
-- group_members"). Other tables' policies below query group_members
-- directly (not a problem — they're a different table's policy), but
-- group_members' own policy must go through this function.
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
  );
$$;

-- profiles: see your own profile, and profiles of anyone you share a group with
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

-- groups: only visible to members. Joining a new group happens through the
-- join_group_by_code() function below (so the invite_code doesn't need to be
-- publicly selectable).
create policy "members can view their groups" on groups
  for select using (
    exists (select 1 from group_members gm where gm.group_id = groups.id and gm.user_id = auth.uid())
  );

create policy "authenticated users can create groups" on groups
  for insert with check (created_by = auth.uid());

-- group_members: see membership rows for groups you're in; only ever add yourself
create policy "members can view group rosters" on group_members
  for select using (
    user_id = auth.uid()
    or public.is_group_member(group_id)
  );

create policy "users can add themselves to a group" on group_members
  for insert with check (user_id = auth.uid());

-- bills / items / item_shares: gated on group membership, walking the chain down
create policy "members can view bills" on bills
  for select using (
    exists (select 1 from group_members gm where gm.group_id = bills.group_id and gm.user_id = auth.uid())
  );
create policy "members can create bills" on bills
  for insert with check (
    exists (select 1 from group_members gm where gm.group_id = bills.group_id and gm.user_id = auth.uid())
  );
create policy "members can update bills" on bills
  for update using (
    exists (select 1 from group_members gm where gm.group_id = bills.group_id and gm.user_id = auth.uid())
  );

create policy "members can view items" on items
  for select using (
    exists (
      select 1 from bills b join group_members gm on gm.group_id = b.group_id
      where b.id = items.bill_id and gm.user_id = auth.uid()
    )
  );
create policy "members can manage items" on items
  for all using (
    exists (
      select 1 from bills b join group_members gm on gm.group_id = b.group_id
      where b.id = items.bill_id and gm.user_id = auth.uid()
    )
  );

create policy "members can view item shares" on item_shares
  for select using (
    exists (
      select 1 from items i
      join bills b on b.id = i.bill_id
      join group_members gm on gm.group_id = b.group_id
      where i.id = item_shares.item_id and gm.user_id = auth.uid()
    )
  );
create policy "members can manage item shares" on item_shares
  for all using (
    exists (
      select 1 from items i
      join bills b on b.id = i.bill_id
      join group_members gm on gm.group_id = b.group_id
      where i.id = item_shares.item_id and gm.user_id = auth.uid()
    )
  );

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
-- join_group_by_code: lets someone who isn't a member yet redeem an invite
-- code, without needing broad SELECT access to the groups table.
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

  insert into group_members (group_id, user_id)
  values (g.id, auth.uid())
  on conflict (group_id, user_id) do nothing;

  return g;
end;
$$;

-- ============================================================================
-- Realtime: after running this file, go to
-- Database -> Replication -> supabase_realtime in the Supabase dashboard and
-- turn on replication for: bills, items, item_shares, group_members.
-- That's what makes changes show up live on everyone's phone.
-- ============================================================================
