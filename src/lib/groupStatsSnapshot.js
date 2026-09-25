import { deriveBillsItemsShares } from './deriveBillData'
import { getStatsWindowStart } from './timeRange'

// The raw state GroupStats.jsx derives every number from (and GroupGraphs.jsx
// reads the bills/items half of), out of a raw bills list with nested items/
// item_shares/bill_payers — get_group_bills' shape.
export function statsRawFromBills(rawBillsData) {
  const { list, items, itemShares } = deriveBillsItemsShares(rawBillsData)
  return {
    rawBills: list.map((b) => ({
      id: b.id,
      title: b.title,
      created_at: b.created_at,
      paid_by: b.paid_by,
      payers: b.payers,
      category_id: b.category_id,
    })),
    rawItems: items,
    rawShares: itemShares,
  }
}

// A groupStatsCache entry built from what the group page already has on
// screen once its complete bill list is loaded — same members, categories
// and bills (get_group_bills carries every field stats uses), so opening
// Stats from the group page paints instantly with no fetch of its own.
// GroupView.jsx keeps this current as bills change (realtime patches
// included), so it's never staler than the group page itself.
export function groupStatsSnapshotFromGroupView({ group, allMembers, categories, bills }) {
  return {
    groupName: group.name || '',
    isPersonal: Boolean(group.is_personal),
    members: allMembers,
    categories,
    ...statsRawFromBills(bills),
    historyStatus: 'complete',
    historyWindowStart: getStatsWindowStart(),
  }
}

// historyWindowStart is a Date in memory but comes back from the
// sessionStorage mirror as an ISO string — and comparing a Date against a
// string is always false, which made a revived page think its history
// window covered nothing. Normalizes either form (or null).
export function toWindowStart(value) {
  return value ? new Date(value) : null
}
