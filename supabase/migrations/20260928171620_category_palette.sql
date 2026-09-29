-- New default category palette (see Settings > Layout's colour-blind
-- option and src/lib/categories.js). The old seven defaults were hard to
-- see in light mode (Eating out 2.4:1, Household and Other 2.7:1 against
-- the page) and Groceries/Bills were nearly identical for colour-blind
-- readers; the new ones all clear 3:1 and are designed to be told apart.
--
-- 1. Existing categories still on an old default colour move to the new
--    one for the same slot. Only exact old-preset matches change: colours
--    someone picked themselves (including the retired yellow/pink/navy
--    extra swatches, which stay as custom colours) are left alone.
--    Idempotent — a second run matches nothing.
-- 2. create_group() and get_or_create_personal_group() seed new groups
--    with the new colours. Bodies are otherwise unchanged from their live
--    definitions; create or replace keeps their grants.

update categories set color = case lower(color)
    when '#4a86e8' then '#534195'  -- Groceries
    when '#e69138' then '#c77510'  -- Eating out
    when '#6aa84f' then '#359e59'  -- Household
    when '#a479e2' then '#b572a0'  -- Bills & utilities
    when '#45818e' then '#2384d8'  -- Transport
    when '#cc4125' then '#a52030'  -- Health
    when '#999999' then '#6a6966'  -- Other
  end
where lower(color) in ('#4a86e8', '#e69138', '#6aa84f', '#a479e2', '#45818e', '#cc4125', '#999999');

create or replace function public.create_group(name text)
returns groups
language plpgsql
security definer
set search_path = public
as $$
declare
  g groups;
  new_member_id uuid;
begin
  insert into groups (name, created_by) values (name, auth.uid()) returning * into g;
  insert into group_members (group_id, user_id) values (g.id, auth.uid()) returning id into new_member_id;
  update groups set admin_id = new_member_id where id = g.id;
  g.admin_id := new_member_id;

  insert into categories (group_id, name, color) values
    (g.id, 'Groceries', '#534195'),
    (g.id, 'Eating out', '#c77510'),
    (g.id, 'Household', '#359e59'),
    (g.id, 'Bills & utilities', '#b572a0'),
    (g.id, 'Transport', '#2384d8'),
    (g.id, 'Health', '#a52030'),
    (g.id, 'Other', '#6a6966');

  return g;
end;
$$;

create or replace function public.get_or_create_personal_group()
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
    (g.id, 'Groceries', '#534195'),
    (g.id, 'Eating out', '#c77510'),
    (g.id, 'Household', '#359e59'),
    (g.id, 'Bills & utilities', '#b572a0'),
    (g.id, 'Transport', '#2384d8'),
    (g.id, 'Health', '#a52030'),
    (g.id, 'Other', '#6a6966');

  return g;
end;
$$;
