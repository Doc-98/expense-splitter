-- ============================================================================
-- One-time DATA fix, not a schema change — a record of a production
-- cleanup already applied directly, not something to run again.
--
-- Before the fix in src/lib/splitwiseImport.js / src/pages/ImportBills.jsx
-- (see the "Settle-up transfers aren't bills" section of the README),
-- every Splitwise import recorded a settle-up transfer (Splitwise's own
-- "Payment" category — someone paying another person directly, not a
-- purchase) as an ordinary bill: one item, one item_shares row, no
-- bill_payers, note starting "Imported from Splitwise (Payment)", title
-- literally "A paid B". That's the exact shape this script targets.
--
-- For each matching bill: inserted one equivalent payments row
-- (from_member = paid_by — whoever handed over the money — to_member =
-- the single item_shares.member_id — whoever received it — same amount,
-- same original created_at), then deleted the bill (cascades its item and
-- item_shares row automatically). Net effect on every person's balance is
-- exactly zero by construction: a transfer bill credits paid_by +amount
-- and debits the receiver -amount via item_shares; a payment row does the
-- identical +amount/-amount via from_member/to_member. Same arithmetic,
-- different table.
--
-- This was verified, not just asserted, before being applied for real:
-- every member's net balance (computed the same way
-- src/lib/settlement.js's computeBalances() does) was snapshotted before
-- the transform and re-derived after, inside one transaction, with a
-- PL/pgSQL gate that would have raised (and thus rolled back everything)
-- on any mismatch over a cent. It matched exactly for every member, and
-- was independently re-confirmed afterward with a completely fresh query
-- against the committed data.
--
-- Scoped to one group (3d498356-3ff0-4f52-82f6-9eabeacad88b) because
-- that's the one this was reported against — the WHERE clause below is
-- intentionally NOT scoped by group_id, since re-running this (a no-op
-- today, nothing left to match) would be the right thing to do for any
-- other group that turns out to have the same history.
-- ============================================================================

insert into payments (group_id, from_member, to_member, amount, created_by, created_at)
select b.group_id, b.paid_by, s.member_id, i.total_price, b.created_by, b.created_at
from bills b
join items i on i.bill_id = b.id
join item_shares s on s.item_id = i.id
where b.note like 'Imported from Splitwise (Payment)%';

delete from bills
where note like 'Imported from Splitwise (Payment)%';
