-- ============================================================================
-- Security hardening, from a review of every policy and SECURITY DEFINER
-- function (plus Supabase's own security/performance advisors). Re-runnable:
-- every statement is a grant/revoke, a drop-if-exists + create, an alter, a
-- create-if-not-exists, or a create-or-replace.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. No function is callable signed out.
--
-- Every function here was executable by `anon` (through PUBLIC), and the
-- ones that act "as the caller" didn't all cope with there being no caller:
-- with auth.uid() null, create_group/get_or_create_personal_group created
-- ownerless groups, join_group_by_code added a blank member to any group
-- whose invite code you had, and claim_guest_profile wiped a guest's name
-- and burned their claim link. Every page is behind a login, so nothing
-- legitimately calls these signed out. Signed-in users keep access to the
-- callable ones; trigger functions aren't API endpoints at all (a trigger
-- fires regardless of EXECUTE — the privilege is checked when the trigger
-- is created, not when it runs). Extension-owned functions are left alone.
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as signature,
           p.prorettype in ('trigger'::regtype, 'event_trigger'::regtype) as is_trigger
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon', f.signature);
    if f.is_trigger then
      execute format('revoke execute on function %s from authenticated', f.signature);
    else
      execute format('grant execute on function %s to authenticated', f.signature);
    end if;
  end loop;
end;
$$;

-- Same default for functions added by later migrations.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

-- ---------------------------------------------------------------------------
-- 2. groups: members may only rename.
--
-- "members can rename their group" allowed an UPDATE of any column — so any
-- member could set admin_id to themselves (then delete the group), or flip
-- is_personal/invite_code. Everything else about a group already goes
-- through admin-checked functions (transfer_admin, delete_group, …), which
-- run as the table owner and aren't limited by these column grants.
-- ---------------------------------------------------------------------------
revoke update on public.groups from anon, authenticated;
grant update (name) on public.groups to authenticated;

-- Groups are created through create_group (which also adds the creator as a
-- member and admin); a bare insert only ever made an orphan group.
drop policy if exists "authenticated users can create groups" on public.groups;

-- ---------------------------------------------------------------------------
-- 3. group_members: what a member can change, and on whose row.
--
-- "members can update group rosters" let any member change any column of
-- anyone's membership: deactivate another member (an admin-only removal,
-- without the admin or the departure snapshot), or rewrite user_id. Direct
-- updates the app actually makes: a guest's name, archived flag and claim
-- token (any member), and your own avatar in the group. Joining, leaving,
-- claiming a guest and admin changes all go through functions.
-- ---------------------------------------------------------------------------
revoke update on public.group_members from anon, authenticated;
grant update (display_name, active, avatar_icon, claim_token) on public.group_members to authenticated;

drop policy if exists "members can update group rosters" on public.group_members;
drop policy if exists "members can update guests" on public.group_members;
drop policy if exists "members can update their own membership" on public.group_members;

create policy "members can update guests" on public.group_members
  for update
  using (user_id is null and public.is_group_member(group_id))
  with check (user_id is null and public.is_group_member(group_id));

create policy "members can update their own membership" on public.group_members
  for update
  using (user_id = (select auth.uid()) and public.is_group_member(group_id))
  with check (user_id = (select auth.uid()));

-- Let any signed-in user insert themselves into ANY group whose id they
-- knew — skipping the invite code entirely. Joining goes through
-- join_group_by_code; creating a group through create_group /
-- get_or_create_personal_group; claiming a guest through
-- claim_guest_profile. Nothing inserts a real member directly.
drop policy if exists "users can add themselves to a group" on public.group_members;

-- ---------------------------------------------------------------------------
-- 4. remove_group_member computes the frozen balance itself.
--
-- It used to store whatever balance the phone sent — computed on the phone
-- from a bill list that a plain select silently cut off at 1000 rows. Now
-- it's get_group_balances' figure (what the group page shows), taken before
-- the member is deactivated. snapshot_balance is still accepted, and
-- ignored, so older app versions keep working. Also refuses a target who
-- isn't in the group, rather than writing a departure record for them.
-- ---------------------------------------------------------------------------
create or replace function public.remove_group_member(
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
  frozen_balance numeric;
begin
  select id into caller_participant_id from group_members
    where group_id = target_group_id and user_id = auth.uid() and active = true;

  if caller_participant_id is null then
    raise exception 'Not authorized to remove members from this group';
  end if;

  select id into target_participant_id from group_members
    where group_id = target_group_id and user_id = target_user_id;

  if target_participant_id is null then
    raise exception 'That person is not a member of this group';
  end if;

  select admin_id into current_admin_id from groups where id = target_group_id;

  if caller_participant_id <> target_participant_id and caller_participant_id <> current_admin_id then
    raise exception 'Only the group admin can remove other members';
  end if;

  select b.balance into frozen_balance
    from public.get_group_balances(target_group_id) b
    where b.member_id = target_participant_id;

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
  values (target_group_id, target_user_id, group_name, now(), coalesce(frozen_balance, 0), snapshot_daily)
  on conflict (group_id, user_id) do update
    set group_name = excluded.group_name,
        left_at = excluded.left_at,
        balance = excluded.balance,
        daily_totals = excluded.daily_totals,
        balance_settled = false;
end;
$$;

revoke execute on function public.remove_group_member(uuid, uuid, text, numeric, jsonb) from public, anon;
grant execute on function public.remove_group_member(uuid, uuid, text, numeric, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Performance, from the advisors.
-- ---------------------------------------------------------------------------

-- Each of these tables had a "view" (SELECT) policy AND a "manage" (ALL)
-- policy with the identical condition, so every row read evaluated the
-- membership check twice. ALL already covers SELECT.
drop policy if exists "members can view bill payers" on public.bill_payers;
drop policy if exists "members can view categories" on public.categories;
drop policy if exists "members can view item shares" on public.item_shares;
drop policy if exists "members can view items" on public.items;
drop policy if exists "members can view recurring bills" on public.recurring_bills;

-- auth.uid() evaluated once per query instead of once per row.
alter policy "profiles are visible to groupmates" on public.profiles
  using (
    id = (select auth.uid())
    or exists (
      select 1 from group_members gm1
      join group_members gm2 on gm1.group_id = gm2.group_id
      where gm1.user_id = (select auth.uid()) and gm2.user_id = profiles.id
    )
  );
alter policy "users can update their own profile" on public.profiles
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter policy "members can view their groups" on public.groups
  using (
    exists (
      select 1 from group_members gm
      where gm.group_id = groups.id and gm.user_id = (select auth.uid()) and gm.active = true
    )
  );
alter policy "members can view group rosters" on public.group_members
  using (user_id = (select auth.uid()) or public.is_group_member(group_id));
alter policy "users can view their own departure snapshots" on public.departure_snapshots
  using (user_id = (select auth.uid()));
alter policy "users can update their own departure snapshots" on public.departure_snapshots
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "users can view their own thresholds" on public.spending_thresholds
  using (user_id = (select auth.uid()));
alter policy "users can add their own thresholds" on public.spending_thresholds
  with check (user_id = (select auth.uid()));
alter policy "users can update their own thresholds" on public.spending_thresholds
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "users can delete their own thresholds" on public.spending_thresholds
  using (user_id = (select auth.uid()));

-- Member-reference columns that deleting a guest (delete_guest_permanently's
-- "still on any bill/payment?" check) and cascading a member deletion scan.
create index if not exists item_shares_member_id_idx on public.item_shares (member_id);
create index if not exists bill_payers_member_id_idx on public.bill_payers (member_id);
create index if not exists bills_paid_by_idx on public.bills (paid_by);
create index if not exists payments_from_member_idx on public.payments (from_member);
create index if not exists payments_to_member_idx on public.payments (to_member);
