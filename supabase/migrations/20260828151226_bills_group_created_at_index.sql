-- ============================================================================
-- Replaces the plain bills(group_id) index with a composite
-- (group_id, created_at desc) one.
--
-- Nearly every bills query filters by group_id *and* either orders by
-- created_at, ranges over it (the "recent window first, backfill after"
-- pattern used throughout GroupStats/AccountStats/GroupGraphs/
-- AccountGraphs/GroupView), or both. The old index only narrowed to the
-- group; created_at desc as the second column lets Postgres satisfy the
-- range/order in the same index scan too, instead of filtering by group
-- then sorting/scanning unindexed within it. The composite's leading
-- column already serves everything the plain index did on its own, so
-- this drops it rather than keeping both.
--
-- Safe to run against an already-deployed database — schema.sql already
-- reflects this for fresh installs.
-- ============================================================================

drop index if exists bills_group_id_idx;
create index if not exists bills_group_id_created_at_idx on bills (group_id, created_at desc);
