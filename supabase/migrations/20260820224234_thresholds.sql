-- ============================================================================
-- Additive migration: personal spending thresholds.
--
-- Safe to run on an existing, already-deployed database — no downtime, no
-- data risk, doesn't touch any existing table. Adds one new table plus its
-- RLS policies. Run this once in the SQL Editor; schema.sql already has
-- this baked in for anyone setting up fresh.
-- ============================================================================

create table spending_thresholds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_name text not null,
  amount numeric(10,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (user_id, category_name)
);

alter table spending_thresholds enable row level security;

create policy "users can view their own thresholds" on spending_thresholds
  for select using (user_id = auth.uid());

create policy "users can add their own thresholds" on spending_thresholds
  for insert with check (user_id = auth.uid());

create policy "users can update their own thresholds" on spending_thresholds
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "users can delete their own thresholds" on spending_thresholds
  for delete using (user_id = auth.uid());
