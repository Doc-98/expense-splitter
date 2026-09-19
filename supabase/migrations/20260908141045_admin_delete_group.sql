-- ============================================================================
-- Additive migration: admin-gated "delete this entire group" — the actual
-- group row, not just its bills (see admin_delete_all_bills.sql for that
-- one). Members, guests, categories, recurring templates, payments, and
-- every departed member's own frozen snapshot for this group all go with
-- it, via each table's own `on delete cascade` back to groups(id).
--
-- Safe to run on an existing, already-deployed database — no downtime, no
-- data risk, doesn't touch any existing table or row, adds one new
-- function. Run this once in the SQL Editor; schema.sql already has this
-- baked in for anyone setting up fresh.
--
-- Without this migration, Group Settings' Danger Zone "Delete group"
-- button will fail — it calls this function, and only this function; there
-- is no other path to deleting a group in this app.
-- ============================================================================

create or replace function public.delete_group(target_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_participant_id uuid;
  current_admin_id uuid;
  target_is_personal boolean;
begin
  select id into caller_participant_id from group_members
    where group_id = target_group_id and user_id = auth.uid() and active = true;

  select admin_id, is_personal into current_admin_id, target_is_personal
    from groups where id = target_group_id;

  if caller_participant_id is null or caller_participant_id <> current_admin_id then
    raise exception 'Only the group admin can delete this group';
  end if;

  if target_is_personal then
    raise exception 'Your personal space can''t be deleted this way';
  end if;

  delete from groups where id = target_group_id;
end;
$$;
