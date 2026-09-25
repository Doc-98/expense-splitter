-- ============================================================================
-- get_group_balances: same result, ~30x faster.
--
-- The first version relied on each table's own RLS policy, which Postgres
-- re-evaluates for every single row: every item re-ran a bills lookup plus a
-- membership check, and every item_share ran a nested items -> bills lookup
-- plus two membership checks, twice over (shares are read in two places).
-- On the largest real group (~960 bills, ~2000 items, ~2100 shares) that was
-- ~1s on an idle database and 3.7s on average in production — and under the
-- burst of realtime-triggered reloads a single receipt scan causes, it hit
-- the 8s statement timeout and exhausted the connection pool.
--
-- Now SECURITY DEFINER with one explicit membership check up front. Every
-- policy on bills/items/item_shares/bill_payers/payments reduces to
-- is_group_member(<that row's group>), so for a single group, "is the caller
-- an active member of target_group_id" is exactly the same gate — a
-- non-member still gets zero rows, same as before. Measured: 1006ms -> 35ms
-- on the same data. The calculation itself is unchanged.
-- ============================================================================

create or replace function public.get_group_balances(target_group_id uuid)
returns table(member_id uuid, balance numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_group_member(target_group_id) then
    return;
  end if;

  return query
  with bill_totals as (
    select b.id as bill_id, b.paid_by, coalesce(sum(i.total_price), 0) as total
    from bills b
    left join items i on i.bill_id = b.id
    where b.group_id = target_group_id
    group by b.id, b.paid_by
  ),
  payer_credits as (
    select bp.member_id, bp.amount as amount
    from bill_payers bp
    join bills b on b.id = bp.bill_id
    where b.group_id = target_group_id
  ),
  single_payer_credits as (
    select bt.paid_by as member_id, bt.total as amount
    from bill_totals bt
    where bt.paid_by is not null
      and not exists (select 1 from bill_payers bp where bp.bill_id = bt.bill_id)
  ),
  item_shares_totals as (
    select i.id as item_id, i.total_price, coalesce(sum(s.shares), 0) as total_shares
    from items i
    join bills b on b.id = i.bill_id
    left join item_shares s on s.item_id = i.id
    where b.group_id = target_group_id
    group by i.id, i.total_price
  ),
  debits as (
    select s.member_id, (ist.total_price * s.shares / ist.total_shares) as amount
    from item_shares s
    join item_shares_totals ist on ist.item_id = s.item_id
    where ist.total_shares > 0
  ),
  payment_credits as (
    select p.from_member as member_id, p.amount as amount from payments p where p.group_id = target_group_id
  ),
  payment_debits as (
    select p.to_member as member_id, -p.amount as amount from payments p where p.group_id = target_group_id
  ),
  all_movements as (
    select m.member_id, m.amount from payer_credits m
    union all
    select m.member_id, m.amount from single_payer_credits m
    union all
    select m.member_id, -m.amount from debits m
    union all
    select m.member_id, m.amount from payment_credits m
    union all
    select m.member_id, m.amount from payment_debits m
  )
  select am.member_id, round(sum(am.amount), 2)
  from all_movements am
  where am.member_id is not null
  group by am.member_id;
end;
$$;
