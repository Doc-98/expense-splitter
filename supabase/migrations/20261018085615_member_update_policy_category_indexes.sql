-- ============================================================================
-- Housekeeping from Supabase's performance advisor. Re-runnable.
--
-- 1. group_members had two permissive UPDATE policies ("members can update
--    guests", "members can update their own membership"), and Postgres
--    evaluates every permissive policy for every row. They're merged into
--    one with exactly the same meaning: a member may update a guest row
--    (user_id null) or their own row, in a group they're active in. The
--    column grants still limit what either can change (display_name,
--    active, avatar_icon, claim_token).
-- 2. Indexes on bills.category_id and items.category_id: deleting a
--    category sets those columns to null ("on delete set null"), which
--    without an index scans every bill and item in the app.
-- ============================================================================

drop policy if exists "members can update guests" on public.group_members;
drop policy if exists "members can update their own membership" on public.group_members;
drop policy if exists "members can update guests and their own membership" on public.group_members;

create policy "members can update guests and their own membership" on public.group_members
  for update
  using (
    public.is_group_member(group_id)
    and (user_id is null or user_id = (select auth.uid()))
  )
  with check (
    (user_id is null and public.is_group_member(group_id))
    or user_id = (select auth.uid())
  );

create index if not exists bills_category_id_idx on public.bills (category_id);
create index if not exists items_category_id_idx on public.items (category_id);
