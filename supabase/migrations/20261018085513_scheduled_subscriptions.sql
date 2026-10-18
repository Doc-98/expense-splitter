-- ============================================================================
-- Subscriptions (recurring_bills) generate their bills in the database, on a
-- schedule, instead of only when someone opens the group. Re-runnable.
--
-- generate_due_recurring_bills() does the work the app used to do itself
-- (src/lib/recurringBills.js): for each active subscription whose
-- next_due_date has come, one bill per missed occurrence (a quiet month
-- still catches up on every one), with one item for the amount, shared
-- between split_member_ids, then next_due_date moved past them. It runs in
-- one transaction, and locks each subscription while it works (skipping
-- one already locked), so two runs at once can never create the same
-- occurrence twice; the app's version could, if two people opened the
-- group at the same moment.
--
-- "Today" is the date in Europe/Rome, where everyone using this app is,
-- and an occurrence's bill is dated midnight there, matching what the app
-- did on a phone in Italy.
--
-- pg_cron runs it every hour, at five past. Opening a group still asks for
-- that group's due bills too (process_due_recurring_bills), so a bill shows
-- up straight away if the hourly run hasn't happened yet.
-- ============================================================================

create extension if not exists pg_cron with schema pg_catalog;

-- The date after `d` for a subscription of this frequency. target_day is the
-- original day of the month (day_of_month), so a subscription on the 31st
-- lands on Feb 28 and then back on Mar 31, never drifting down to the 28th.
-- Same rule as advanceDate() in the app had.
create or replace function public.recurring_next_due(d date, frequency text, target_day integer)
returns date
language sql
immutable
set search_path = public
as $$
  select case frequency
    when 'weekly' then d + 7
    when 'monthly' then (
      select m + (least(coalesce(target_day, extract(day from d)::int),
                        extract(day from (m + interval '1 month' - interval '1 day'))::int) - 1)
      from (select (date_trunc('month', d) + interval '1 month')::date as m) s
    )
    when 'yearly' then (
      select m + (least(coalesce(target_day, extract(day from d)::int),
                        extract(day from (m + interval '1 month' - interval '1 day'))::int) - 1)
      from (select (date_trunc('month', d) + interval '1 year')::date as m) s
    )
  end
$$;

-- All groups when target_group_id is null (the hourly job), else just that
-- one. Returns how many bills it created.
create or replace function public.generate_due_recurring_bills(target_group_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Europe/Rome')::date;
  t record;
  due date;
  new_bill_id uuid;
  new_item_id uuid;
  occurrences integer;
  created integer := 0;
begin
  for t in
    select * from recurring_bills
    where active
      and next_due_date <= today
      and (target_group_id is null or group_id = target_group_id)
    order by id
    for update skip locked
  loop
    due := t.next_due_date;
    occurrences := 0;
    -- The cap only guards against corrupted data looping forever.
    while due is not null and due <= today and occurrences < 1000 loop
      insert into bills (group_id, title, note, paid_by, category_id, default_buyer_ids,
                         recurring_bill_id, created_by, created_at)
      values (t.group_id, t.title, t.note, t.paid_by, t.category_id, t.split_member_ids,
              t.id, t.created_by, due::timestamp at time zone 'Europe/Rome')
      returning id into new_bill_id;

      insert into items (bill_id, name, unit_price, quantity, total_price, category_id)
      values (new_bill_id, t.title, t.amount, 1, t.amount, t.category_id)
      returning id into new_item_id;

      insert into item_shares (item_id, member_id, shares)
      select distinct new_item_id, member_id, 1
      from unnest(coalesce(t.split_member_ids, '{}'::uuid[])) as member_id;

      due := public.recurring_next_due(due, t.frequency, t.day_of_month);
      occurrences := occurrences + 1;
    end loop;

    update recurring_bills set next_due_date = due where id = t.id;
    created := created + occurrences;
  end loop;

  return created;
end;
$$;

-- What the app calls when someone opens a group: that group's due bills,
-- for its members only.
create or replace function public.process_due_recurring_bills(target_group_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_group_id is null or not public.is_group_member(target_group_id) then
    return 0;
  end if;
  return public.generate_due_recurring_bills(target_group_id);
end;
$$;

-- Only the hourly job (as postgres) runs the all-groups version; signed-in
-- users go through process_due_recurring_bills, which checks membership.
revoke execute on function public.generate_due_recurring_bills(uuid) from public, anon, authenticated;
revoke execute on function public.process_due_recurring_bills(uuid) from public, anon;
grant execute on function public.process_due_recurring_bills(uuid) to authenticated;
revoke execute on function public.recurring_next_due(date, text, integer) from public, anon;

-- cron.schedule with an existing job name replaces that job.
select cron.schedule(
  'generate-due-subscriptions',
  '5 * * * *',
  $$select public.generate_due_recurring_bills()$$
);
