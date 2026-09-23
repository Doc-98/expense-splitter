-- ============================================================================
-- get_group_balances: computes each member's net balance for a group
-- entirely in the database, instead of downloading every bill/item/share/
-- payment in the group's history to a device just to add them up there.
--
-- This is a straight SQL translation of computeBalances()/creditPayers() in
-- src/lib/settlement.js — same model (each bill's cost split across its
-- item_shares proportional to `shares`, credited to whoever's in
-- bill_payers if that's non-empty, otherwise to paid_by; a payment moves
-- balance from from_member to to_member), verified against a real local
-- Postgres instance using the exact same fixtures as settlement.test.js's
-- computeBalances suite (single-payer, weighted shares, multi-payer,
-- payers-overrides-paid_by, a plain payment, the zero-shares divide-by-zero
-- guard, and the many-small-items rounding case) before this migration was
-- written — all seven produced identical results to the trusted JS
-- implementation. src/lib/settlement.js's own simplifyDebts() still runs
-- client-side on the small (one row per member) result this returns — that
-- part is cheap and there's no reason to move it.
--
-- Deliberately NOT security definer — a plain function, so every table it
-- reads (bills/items/item_shares/bill_payers/payments) still goes through
-- that table's own existing RLS policy as the calling user, exactly as a
-- direct client-side select from any of them already does today. A caller
-- who isn't an active member of target_group_id simply gets rows filtered
-- to nothing by those policies, same as a direct query would, so there's
-- no separate membership check to keep in sync here.
--
-- Was also the fix for a real, previously-reported bug: the app's
-- background warm-up prefetch (see prefetchGroup.js) used to compute this
-- same balance client-side from a *windowed* recent-bills fetch (for a
-- fast preview) but *all* payments ever made — an old payment counted
-- against bills outside that window looked, briefly, like a wildly wrong
-- balance until the real, complete load replaced it a moment later. This
-- function always sums the group's complete history server-side
-- regardless of how much of it any given client happens to have fetched,
-- so that mismatch can't happen at all anymore, not just get papered over.
--
-- Safe to run on an existing, already-deployed database — adds one new
-- function, touches no existing tables/policies/data. Run this once in the
-- SQL Editor; schema.sql already has this baked in for anyone setting up
-- fresh.
-- ============================================================================

create function public.get_group_balances(target_group_id uuid)
returns table(member_id uuid, balance numeric)
language sql
stable
as $$
  with bill_totals as (
    -- The billTotal creditPayers() uses for its single-payer credit branch
    -- — a multi-payer bill ignores this entirely, crediting each
    -- bill_payers.amount directly instead (see payer_credits below).
    select b.id as bill_id, b.paid_by, coalesce(sum(i.total_price), 0) as total
    from bills b
    left join items i on i.bill_id = b.id
    where b.group_id = target_group_id
    group by b.id, b.paid_by
  ),
  payer_credits as (
    -- Multi-payer bills: each named payer credited their own contributed
    -- amount, paid_by ignored entirely — same "payers wins if present"
    -- rule creditPayers() enforces.
    select bp.member_id, bp.amount as amount
    from bill_payers bp
    join bills b on b.id = bp.bill_id
    where b.group_id = target_group_id
  ),
  single_payer_credits as (
    -- Single-payer bills only — any bill with at least one bill_payers row
    -- is excluded here (handled above instead), matching creditPayers().
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
    -- Each item's total split across its item_shares, proportional to
    -- shares — same portion formula as computeBalances(). An item whose
    -- shares sum to zero contributes nothing here (the join to
    -- item_shares_totals' total_shares > 0 filter below), matching the
    -- `if (totalShares <= 0) continue` guard.
    select s.member_id, (ist.total_price * s.shares / ist.total_shares) as amount
    from item_shares s
    join item_shares_totals ist on ist.item_id = s.item_id
    where ist.total_shares > 0
  ),
  payment_credits as (
    select from_member as member_id, amount as amount from payments where group_id = target_group_id
  ),
  payment_debits as (
    select to_member as member_id, -amount as amount from payments where group_id = target_group_id
  ),
  all_movements as (
    select member_id, amount from payer_credits
    union all
    select member_id, amount from single_payer_credits
    union all
    select member_id, -amount from debits
    union all
    select member_id, amount from payment_credits
    union all
    select member_id, amount from payment_debits
  )
  -- Summed in full numeric precision and rounded once at the very end,
  -- same as computeBalances()' own round2() — never rounded per-movement,
  -- which could compound tiny drift across many of them.
  select member_id, round(sum(amount), 2) as balance
  from all_movements
  where member_id is not null
  group by member_id;
$$;
