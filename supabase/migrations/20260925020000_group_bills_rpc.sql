-- ============================================================================
-- get_group_bills: the group page's bill list, in one call, ~10x faster.
--
-- Returns exactly what the client used to ask PostgREST for with
--   bills?select=*,items(id,total_price,category_id,item_shares(member_id,shares)),bill_payers(member_id,amount)
-- — a JSON array of bill rows, each with nested `items` (each with nested
-- `item_shares`) and `bill_payers`, newest first. That embedded select ran
-- every nested row through its table's RLS policy one row at a time (items
-- and item_shares each re-derive their bill's group and re-check
-- membership per row), which cost ~1s per 500-bill page on the largest real
-- group and was the single biggest consumer of database time in the app.
--
-- Same gate as get_group_balances (20260925011000): SECURITY DEFINER with
-- one is_group_member() check up front. Every policy on bills/items/
-- item_shares/bill_payers reduces to is_group_member(<that row's group>),
-- so for one group this is the same access rule — a non-member gets [].
--
-- `since` (optional) limits it to bills created at or after that moment,
-- for the group page's fast first paint of a recent window.
-- Ordered by created_at desc, then id desc: a stable order even for the
-- many imported bills sharing one timestamp.
-- ============================================================================

create or replace function public.get_group_bills(target_group_id uuid, since timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_group_member(target_group_id) then
    return '[]'::jsonb;
  end if;

  return (
    with gb as (
      select b.* from bills b
      where b.group_id = target_group_id
        and (since is null or b.created_at >= since)
    ),
    shares as (
      select s.item_id,
             jsonb_agg(jsonb_build_object('member_id', s.member_id, 'shares', s.shares)) as item_shares
      from item_shares s
      join items i on i.id = s.item_id
      join gb on gb.id = i.bill_id
      group by s.item_id
    ),
    bill_items as (
      select i.bill_id,
             jsonb_agg(jsonb_build_object(
               'id', i.id,
               'total_price', i.total_price,
               'category_id', i.category_id,
               'item_shares', coalesce(sh.item_shares, '[]'::jsonb)
             )) as items
      from items i
      join gb on gb.id = i.bill_id
      left join shares sh on sh.item_id = i.id
      group by i.bill_id
    ),
    payers as (
      select bp.bill_id,
             jsonb_agg(jsonb_build_object('member_id', bp.member_id, 'amount', bp.amount)) as bill_payers
      from bill_payers bp
      join gb on gb.id = bp.bill_id
      group by bp.bill_id
    )
    select coalesce(
      jsonb_agg(
        to_jsonb(gb) || jsonb_build_object(
          'items', coalesce(bi.items, '[]'::jsonb),
          'bill_payers', coalesce(p.bill_payers, '[]'::jsonb)
        )
        order by gb.created_at desc, gb.id desc
      ),
      '[]'::jsonb
    )
    from gb
    left join bill_items bi on bi.bill_id = gb.id
    left join payers p on p.bill_id = gb.id
  );
end;
$$;
