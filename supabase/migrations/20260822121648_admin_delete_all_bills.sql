-- ============================================================================
-- Additive migration: admin-gated "delete all bills", with an optional
-- settle-up (payment) wipe.
--
-- Safe to run on an existing, already-deployed database — no downtime, no
-- data risk, doesn't touch any existing table or row, adds one new
-- function. Run this once in the SQL Editor; schema.sql already has this
-- baked in for anyone setting up fresh.
--
-- Without this migration, the app's "Delete all bills" button and a
-- bulk-select that happens to cover every bill in a group will fail — both
-- now call this function instead of deleting directly.
-- ============================================================================

create or replace function public.delete_all_group_bills(target_group_id uuid, delete_payments boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_participant_id uuid;
  current_admin_id uuid;
begin
  select id into caller_participant_id from group_members
    where group_id = target_group_id and user_id = auth.uid() and active = true;

  select admin_id into current_admin_id from groups where id = target_group_id;

  if caller_participant_id is null or caller_participant_id <> current_admin_id then
    raise exception 'Only the group admin can delete every bill in a group';
  end if;

  delete from bills where group_id = target_group_id;

  if delete_payments then
    delete from payments where group_id = target_group_id;
  end if;
end;
$$;
