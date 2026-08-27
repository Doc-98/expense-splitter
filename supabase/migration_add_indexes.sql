-- ============================================================================
-- Additive migration: indexes on the foreign-key columns every group-page
-- load actually filters on.
--
-- Postgres does NOT automatically index a foreign key column — only primary
-- keys and explicit unique constraints get one. Most tables here only ever
-- got their bare `id uuid primary key`, so `bills.group_id`, `items.bill_id`,
-- `payments.group_id`, `categories.group_id`, `recurring_bills.group_id`,
-- `group_members.user_id`, and `departure_snapshots.user_id` have all been
-- unindexed since day one (item_shares and bill_payers are the exception —
-- their primary keys already lead with item_id/bill_id, so they're already
-- covered). Every one of the columns indexed below is hit by a plain
-- `.eq('group_id', …)` / `.eq('user_id', …)` / `.eq('bill_id', …)` on every
-- single group-page, stats, or graphs load (see GroupView.jsx,
-- GroupStats.jsx, GroupGraphs.jsx, AccountGraphs.jsx, AccountStats.jsx,
-- Groups.jsx) — without an index, each one is a full sequential scan of the
-- *entire* table, across every group and every user, not just the one
-- being asked for. That gets slower as the app accumulates more bills
-- app-wide regardless of which group or account is asking, and is the most
-- direct explanation for a "canceling statement due to statement timeout"
-- error on a bills load.
--
-- Safe to run on an existing, already-deployed database — no downtime, no
-- data risk, doesn't touch any existing row. Run this once in the SQL
-- Editor; schema.sql already has this baked in for anyone setting up
-- fresh.
-- ============================================================================

create index if not exists bills_group_id_idx on bills (group_id);
create index if not exists items_bill_id_idx on items (bill_id);
create index if not exists payments_group_id_idx on payments (group_id);
create index if not exists categories_group_id_idx on categories (group_id);
create index if not exists recurring_bills_group_id_idx on recurring_bills (group_id);
create index if not exists group_members_user_id_idx on group_members (user_id);
create index if not exists departure_snapshots_user_id_idx on departure_snapshots (user_id);
