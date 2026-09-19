-- ============================================================================
-- Personal spending groups
--
-- Adds first-class support for tracking your own spending without a real
-- group around it. Under the hood it's exactly what it always could have
-- been done as manually (a group with just yourself in it) — this just
-- makes that a real, auto-created, UI-first concept instead of a
-- workaround: one `is_personal = true` group per account, lazily created
-- the first time someone opens the new "Personal" tab, reusing every bit
-- of existing per-group machinery (bills, items, categories, thresholds,
-- stats, receipt scanning, recurring bills, CSV export) with zero
-- duplication.
--
-- Safe to run against an already-deployed database — schema.sql is kept in
-- sync with this (see the groups table, join_group_by_code(), and the new
-- get_or_create_personal_group() there) for fresh installs. No backfill
-- needed: existing accounts simply get their personal group created the
-- first time they visit the Personal tab.
-- ============================================================================

alter table groups add column if not exists is_personal boolean not null default false;

-- Defense in depth: a personal group's invite_code is never surfaced by the
-- UI, but refuse it here too rather than relying solely on that.
create or replace function public.join_group_by_code(invite text)
returns groups
language plpgsql
security definer
set search_path = public
as $$
declare
  g groups;
  participant_id uuid;
begin
  select * into g from groups where invite_code = invite;

  if g.id is null then
    raise exception 'Invalid invite code';
  end if;

  if g.is_personal then
    raise exception 'Invalid invite code';
  end if;

  insert into group_members (group_id, user_id, active)
  values (g.id, auth.uid(), true)
  on conflict (group_id, user_id) do update set active = true
  returning id into participant_id;

  if g.admin_id is null then
    update groups set admin_id = participant_id where id = g.id;
    g.admin_id := participant_id;
  end if;

  return g;
end;
$$;

create function public.get_or_create_personal_group()
returns groups
language plpgsql
security definer
set search_path = public
as $$
declare
  g groups;
  new_member_id uuid;
begin
  select gr.* into g
  from groups gr
  join group_members gm on gm.group_id = gr.id
  where gr.is_personal = true
    and gm.user_id = auth.uid()
    and gm.active = true
  limit 1;

  if g.id is not null then
    return g;
  end if;

  insert into groups (name, created_by, is_personal) values ('Personal', auth.uid(), true) returning * into g;
  insert into group_members (group_id, user_id) values (g.id, auth.uid()) returning id into new_member_id;
  update groups set admin_id = new_member_id where id = g.id;
  g.admin_id := new_member_id;

  insert into categories (group_id, name, color) values
    (g.id, 'Groceries', '#4a86e8'),
    (g.id, 'Eating out', '#e69138'),
    (g.id, 'Household', '#6aa84f'),
    (g.id, 'Bills & utilities', '#a479e2'),
    (g.id, 'Transport', '#45818e'),
    (g.id, 'Health', '#cc4125'),
    (g.id, 'Other', '#999999');

  return g;
end;
$$;
