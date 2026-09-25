// Small, pure helpers for the stats pages — each replaces a nested
// filter-inside-a-loop that grew with bills × items on every render.

// Your Stats' overall balance: your server-computed balance in every group
// you're still in (get_group_balances, one result per group, in the same
// order as groupIds), plus any not-yet-settled balance frozen from a group
// you've left.
export function overallBalanceFrom(groupIds, participantByGroup, balancesByGroup, snapshots) {
  let sum = 0
  groupIds.forEach((groupId, i) => {
    sum += balancesByGroup[i]?.[participantByGroup.get(groupId)] || 0
  })
  for (const snapshot of snapshots) {
    if (!snapshot.balance_settled) sum += Number(snapshot.balance)
  }
  return Math.round(sum * 100) / 100
}

// { billId -> sum of its items' total_price } in one pass.
export function totalsByBill(items) {
  const totals = new Map()
  for (const item of items) totals.set(item.bill_id, (totals.get(item.bill_id) || 0) + Number(item.total_price))
  return totals
}

// Splits a multi-group { list, items, itemShares } into one slice per group
// (in groupIds order) in a single pass over each array.
export function splitByGroup({ list, items, itemShares }, groupIds) {
  const byGroup = new Map(groupIds.map((groupId) => [groupId, { bills: [], items: [], itemShares: [] }]))
  const groupOfBill = new Map()
  for (const bill of list) {
    const slice = byGroup.get(bill.group_id)
    if (!slice) continue
    slice.bills.push(bill)
    groupOfBill.set(bill.id, bill.group_id)
  }
  const groupOfItem = new Map()
  for (const item of items) {
    const groupId = groupOfBill.get(item.bill_id)
    if (!groupId) continue
    byGroup.get(groupId).items.push(item)
    groupOfItem.set(item.id, groupId)
  }
  for (const share of itemShares) {
    const groupId = groupOfItem.get(share.item_id)
    if (groupId) byGroup.get(groupId).itemShares.push(share)
  }
  return groupIds.map((groupId) => byGroup.get(groupId))
}
