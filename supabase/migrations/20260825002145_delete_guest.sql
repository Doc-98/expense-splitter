-- ============================================================================
-- Additive migration: permanently deleting an archived guest.
--
-- Safe to run on an existing, already-deployed database — no downtime, no
-- data risk, doesn't touch any existing table or row, adds one new
-- function. Run this once in the SQL Editor; schema.sql already has this
-- baked in for anyone setting up fresh.
--
-- Without this migration, "Delete permanently" next to an archived guest
-- in Group Settings will fail — the app calls this function instead of
-- deleting the group_members row directly.
-- ============================================================================

create or replace function public.delete_guest_permanently(target_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  target_user_id uuid;
  target_active boolean;
  caller_participant_id uuid;
  current_admin_id uuid;
  has_history boolean;
begin
  select group_id, user_id, active into target_group_id, target_user_id, target_active
    from group_members where id = target_member_id;

  if target_group_id is null then
    raise exception 'Guest not found';
  end if;

  if target_user_id is not null then
    raise exception 'Only guests can be permanently deleted';
  end if;

  if target_active then
    raise exception 'Remove this guest before deleting them permanently';
  end if;

  select id into caller_participant_id from group_members
    where group_id = target_group_id and user_id = auth.uid() and active = true;

  select admin_id into current_admin_id from groups where id = target_group_id;

  if caller_participant_id is null or caller_participant_id <> current_admin_id then
    raise exception 'Only the group admin can permanently delete a guest';
  end if;

  select
    exists(select 1 from bills where paid_by = target_member_id)
    or exists(select 1 from bill_payers where member_id = target_member_id)
    or exists(select 1 from item_shares where member_id = target_member_id)
    or exists(select 1 from payments where from_member = target_member_id or to_member = target_member_id)
    or exists(
      select 1 from recurring_bills
      where paid_by = target_member_id or target_member_id = any(split_member_ids)
    )
  into has_history;

  if has_history then
    raise exception 'This guest is still on at least one bill, payment, or recurring template — remove them from those first';
  end if;

  delete from group_members where id = target_member_id;
end;
$$;
