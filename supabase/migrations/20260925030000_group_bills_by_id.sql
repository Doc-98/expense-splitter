-- ============================================================================
-- get_group_bills: optional `bill_ids`, so the group page can refresh just
-- the bills a realtime change touched instead of re-downloading the whole
-- group (~800 KB for the largest group) for one edited item.
--
-- Same function, same shape, same security gate as the full list — a patch
-- and a full reload can never disagree on format. The ids are still
-- restricted to target_group_id, so asking for a bill from another group
-- (or one that's been deleted) just returns nothing for it; the client
-- treats "asked for it, didn't get it back" as "remove it".
--
-- Adding a parameter creates a second overload rather than replacing the
-- function, and two overloads that both accept (target_group_id) make every
-- call ambiguous — so the old signature is dropped first. Nothing deployed
-- calls it yet. Safe to re-run: drop-if-exists plus create-or-replace.
--
-- Nested items/shares/payers are aggregated in an explicit order, so the
-- same bill is byte-identical whether it comes from a full list or a
-- patch (without it, Postgres' plan decided the order, and it differed).
-- ============================================================================

drop function if exists public.get_group_bills(uuid, timestamptz);

create or replace function public.get_group_bills(
  target_group_id uuid,
  since timestamptz default null,
  bill_ids uuid[] default null
)
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
        and (bill_ids is null or b.id = any(bill_ids))
    ),
    shares as (
      select s.item_id,
             jsonb_agg(jsonb_build_object('member_id', s.member_id, 'shares', s.shares) order by s.member_id) as item_shares
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
             ) order by i.created_at, i.id) as items
      from items i
      join gb on gb.id = i.bill_id
      left join shares sh on sh.item_id = i.id
      group by i.bill_id
    ),
    payers as (
      select bp.bill_id,
             jsonb_agg(jsonb_build_object('member_id', bp.member_id, 'amount', bp.amount) order by bp.member_id) as bill_payers
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
