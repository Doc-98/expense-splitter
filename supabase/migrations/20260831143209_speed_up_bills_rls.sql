-- ============================================================================
-- Performance-only migration: rewrite the bills RLS policies to route
-- through is_group_member() instead of a hand-rolled join — the same fix
-- speed_up_item_rls.sql already applied to items / item_shares /
-- bill_payers, just never ported to bills itself, the table those three
-- exist to describe and the single most row-heavy, most-queried table in
-- the app.
--
-- is_group_member() is STABLE, so repeated calls with the same group_id
-- within one query become Memoize candidates — Postgres evaluates the
-- membership check once per distinct group instead of re-deriving it via
-- a fresh group_members lookup on every single returned bill row. Any
-- query that pulls more than a handful of bills for one group (a group's
-- bill list, a stats/graphs window, the bank-import wizard's own
-- history/duplicate checks) shares this exact shape — one group_id,
-- repeated many times over.
--
-- Semantics are identical either way — same active-membership check via
-- the same group_members row, just evaluated through the stable function
-- instead of inline.
--
-- Safe to run on an existing, already-deployed database — no downtime, no
-- data risk, just replaces four policy definitions. Run this once in the
-- SQL Editor; schema.sql already has this baked in for anyone setting up
-- fresh.
-- ============================================================================

drop policy "members can view bills" on bills;
create policy "members can view bills" on bills
  for select using (public.is_group_member(bills.group_id));

drop policy "members can create bills" on bills;
create policy "members can create bills" on bills
  for insert with check (public.is_group_member(bills.group_id));

drop policy "members can update bills" on bills;
create policy "members can update bills" on bills
  for update using (public.is_group_member(bills.group_id));

drop policy "members can delete bills" on bills;
create policy "members can delete bills" on bills
  for delete using (public.is_group_member(bills.group_id));
