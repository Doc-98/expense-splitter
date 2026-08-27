-- ============================================================================
-- Performance-only migration: rewrite the items / item_shares / bill_payers
-- RLS policies to route through is_group_member() instead of a hand-rolled
-- join.
--
-- is_group_member() is STABLE, so repeated calls with the same group_id
-- within one query become Memoize candidates — Postgres evaluates the
-- membership check once per distinct group instead of re-deriving it via a
-- fresh bills/group_members join on every single item/share/payer row.
-- On a group with a real amount of history (the case that actually
-- surfaced this — ~1100 bills, ~2150 items) the join-per-row version
-- measured ~9s for the bill list's full nested load (well past a
-- statement timeout, and the direct cause of a production
-- "canceling statement due to statement timeout" report); this version
-- measures ~340ms for the exact same result set. Semantics are identical
-- either way — same active-membership check, verified before and after
-- against both a real member (full visibility preserved) and an inactive
-- member (still sees nothing).
--
-- Safe to run on an existing, already-deployed database — no downtime, no
-- data risk, just replaces six policy definitions. Run this once in the
-- SQL Editor; schema.sql already has this baked in for anyone setting up
-- fresh.
-- ============================================================================

drop policy "members can view items" on items;
create policy "members can view items" on items
  for select using (
    public.is_group_member((select b.group_id from bills b where b.id = items.bill_id))
  );

drop policy "members can manage items" on items;
create policy "members can manage items" on items
  for all using (
    public.is_group_member((select b.group_id from bills b where b.id = items.bill_id))
  );

drop policy "members can view item shares" on item_shares;
create policy "members can view item shares" on item_shares
  for select using (
    public.is_group_member((select b.group_id from items i join bills b on b.id = i.bill_id where i.id = item_shares.item_id))
  );

drop policy "members can manage item shares" on item_shares;
create policy "members can manage item shares" on item_shares
  for all using (
    public.is_group_member((select b.group_id from items i join bills b on b.id = i.bill_id where i.id = item_shares.item_id))
  );

drop policy "members can view bill payers" on bill_payers;
create policy "members can view bill payers" on bill_payers
  for select using (
    public.is_group_member((select b.group_id from bills b where b.id = bill_payers.bill_id))
  );

drop policy "members can manage bill payers" on bill_payers;
create policy "members can manage bill payers" on bill_payers
  for all using (
    public.is_group_member((select b.group_id from bills b where b.id = bill_payers.bill_id))
  );
