-- ============================================================================
-- Adds bank_import_drafts: one in-progress bank-statement import per group —
-- the transactions a file was parsed into, plus each one's review state,
-- surviving a closed tab/browser so the one-at-a-time review wizard
-- (ImportBankStatement.jsx) can be resumed later instead of losing
-- everything not yet gotten through. Only ever holds what's still *unread*
-- as far as review is concerned — a reviewed transaction is a real row in
-- `bills` by that point, not something this table needs to remember too.
--
-- `unique (group_id)` — deliberately only one draft at a time per group.
--
-- Safe to run on an existing, already-deployed database — additive only,
-- no existing table touched. Run this once in the SQL Editor; schema.sql
-- already has this baked in for anyone setting up fresh.
-- ============================================================================

create table bank_import_drafts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  transactions jsonb not null,
  review jsonb not null,
  duplicate_indexes jsonb not null default '[]'::jsonb,
  cross_group_matches jsonb not null default '{}'::jsonb,
  current_position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id)
);

alter table bank_import_drafts enable row level security;

create policy "members can manage bank import drafts" on bank_import_drafts
  for all using (public.is_group_member(group_id));
