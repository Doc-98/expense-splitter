-- ============================================================================
-- Additive migration: per-person avatar icons.
--
-- Safe to run on an existing, already-deployed database — two new nullable
-- columns, no data touched, no new tables or policies needed (the existing
-- "users can update their own profile" and "members can update group
-- rosters" policies already cover writing these). Run this once in the SQL
-- Editor; schema.sql already has this baked in for anyone setting up fresh.
--
-- default_avatar_icon (profiles): the account-wide fallback, set from
-- Settings > Profile.
-- avatar_icon (group_members): a per-group override on top of that
-- fallback, set from Group Settings > General — null means "use my
-- account default", same as the account default being null means "no icon
-- set, fall back to the initial-circle avatar this app has always shown".
-- Both store one of AVATAR_ICONS' ids (src/components/avatarIcons.jsx),
-- e.g. 'bomb' — validated client-side against that fixed list, not with a
-- db-level check constraint, so adding a new icon to the set later never
-- needs a migration of its own.
-- ============================================================================

alter table profiles add column default_avatar_icon text;
alter table group_members add column avatar_icon text;
