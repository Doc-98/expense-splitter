import { deriveBillsItemsShares } from './deriveBillData'
import { computeSpendingTotals, computeBalances, simplifyDebts } from './settlement'
import { getPeriodRange, filterByDateRange } from './timeRange'

// Same shape GroupView.jsx has always fetched bills in — pulled out here
// (rather than left as a local constant) so prefetchGroup.js's background
// warm-up asks for exactly the same columns, not a shape that happens to
// drift out of sync with what GroupView.jsx itself needs to render.
export const GROUP_BILLS_SELECT =
  '*, items(id, total_price, category_id, item_shares(member_id, shares)), bill_payers(member_id, amount)'

// Pulled out of GroupView.jsx's own computeAndSetSettlement (per-bill
// personal totals, the week/month preview totals, and the group's
// simplified debts) so the exact same derivation can run twice: once for
// real on mount, and once ahead of time during the app-boot warm-up (see
// prefetchGroup.js) — without those two call sites drifting apart. Pure —
// takes the bills/payments already fetched, returns the derived shape, no
// state setters, no network of its own.
export function computeGroupViewSnapshot(billsData, paymentsData) {
  const { list: settlementBills, items, itemShares } = deriveBillsItemsShares(billsData)

  const billPersonalTotals = {}
  for (const bill of settlementBills) {
    const billItems = items.filter((it) => it.bill_id === bill.id)
    const billItemIds = new Set(billItems.map((it) => it.id))
    const billItemShares = itemShares.filter((s) => billItemIds.has(s.item_id))
    billPersonalTotals[bill.id] = computeSpendingTotals({ bills: [bill], items: billItems, itemShares: billItemShares })
  }

  const thisWeek = getPeriodRange('week', 0)
  const thisMonth = getPeriodRange('month', 0)
  const weekBills = filterByDateRange(settlementBills, items, [], thisWeek.start, thisWeek.end)
  const monthBills = filterByDateRange(settlementBills, items, [], thisMonth.start, thisMonth.end)
  const weekTotal = weekBills.items.reduce((sum, it) => sum + Number(it.total_price), 0)
  const monthTotal = monthBills.items.reduce((sum, it) => sum + Number(it.total_price), 0)

  const paymentsForBalances = paymentsData.map((p) => ({
    from_user: p.from_member,
    to_user: p.to_member,
    amount: p.amount,
  }))
  const balances = computeBalances({ bills: settlementBills, items, itemShares, payments: paymentsForBalances })
  const settlement = simplifyDebts(balances)

  return { billPersonalTotals, weekTotal, monthTotal, settlement }
}
