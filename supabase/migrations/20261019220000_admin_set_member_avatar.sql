-- ============================================================================
-- set_member_avatar: lets a group's admin choose another member's avatar in
-- that group, to sort out two people who look the same on bills (the group
-- page points it out — see GroupAvatarClashNotice.jsx). Everyone still sets
-- their own (and any member a guest's) directly on group_members; this only
-- adds the admin's reach to other real members, and only to avatar_icon,
-- which is why it's a function rather than a wider update policy (a policy
-- would also let the admin rename or deactivate them).
--
-- icon is one of AVATAR_ICONS' ids (src/components/avatarIcons.jsx), or
-- null for "use their account default". Not validated against that list,
-- same as the direct updates: an unknown id just draws as the initial.
-- ============================================================================
create or replace function public.set_member_avatar(target_member_id uuid, icon text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group_id uuid;
  caller_participant_id uuid;
begin
  select group_id into target_group_id from group_members
    where id = target_member_id and active = true;
  if target_group_id is null then
    raise exception 'That person is not an active member of this group';
  end if;

  select id into caller_participant_id from group_members
    where group_id = target_group_id and user_id = auth.uid() and active = true;
  if caller_participant_id is null
     or caller_participant_id is distinct from (select admin_id from groups where id = target_group_id) then
    raise exception 'Only the group admin can change someone else''s avatar';
  end if;

  if icon is not null and length(icon) > 40 then
    raise exception 'Unknown avatar';
  end if;

  update group_members set avatar_icon = icon where id = target_member_id;
end;
$$;

revoke execute on function public.set_member_avatar(uuid, text) from public, anon;
grant execute on function public.set_member_avatar(uuid, text) to authenticated;
