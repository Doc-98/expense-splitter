// Realtime can't filter items/item_shares by group (they only carry
// bill_id/item_id), and delete events carry nothing but the row's primary
// key. This tracks which bills and items belong to the page — and which
// bill each item is on — so an event can be traced to the bill it affects,
// or dropped if it belongs to another group.
//
// Deliberately errs towards doing more work, never less:
//   - until the first real load has been learned, every event means
//     "reload everything";
//   - ids are never forgotten (a deleted id lingering only costs a
//     harmless extra fetch);
//   - a new bill/item is learned from its own INSERT event, so the rows
//     that follow it a moment later are still traced correctly.
// Anything it wrongly drops is caught by the periodic resync.

// "Can't tell which bill — reload the whole list." (billPatches.js's
// queueAffected relies on this exact value.)
export const ALL_BILLS = 'all'

export function createRealtimeRelevance() {
  const billIds = new Set()
  const itemToBill = new Map()
  let ready = false

  function learn(bills) {
    for (const bill of bills || []) {
      billIds.add(bill.id)
      for (const item of bill.items || []) itemToBill.set(item.id, bill.id)
    }
    ready = true
  }

  // Returns null (not this page's), ALL_BILLS (reload everything), or an
  // array with the one bill id the change touches.
  function affectedBills(table, payload) {
    const { eventType } = payload
    const row = eventType === 'DELETE' ? payload.old || {} : payload.new || {}

    if (table === 'bills') {
      // INSERT/UPDATE subscriptions are filtered to this group server-side;
      // a DELETE only carries the id, so check it's one of ours.
      if (eventType === 'DELETE') {
        if (!ready) return ALL_BILLS
        return billIds.has(row.id) ? [row.id] : null
      }
      if (row.id) billIds.add(row.id)
      return ready && row.id ? [row.id] : ALL_BILLS
    }

    if (table === 'items') {
      if (eventType === 'DELETE') {
        if (!ready) return ALL_BILLS
        return itemToBill.has(row.id) ? [itemToBill.get(row.id)] : null
      }
      if (billIds.has(row.bill_id)) {
        itemToBill.set(row.id, row.bill_id)
        return ready ? [row.bill_id] : ALL_BILLS
      }
      return ready ? null : ALL_BILLS
    }

    if (table === 'item_shares') {
      // item_id is part of the primary key, so it's present even on DELETE.
      if (!ready) return ALL_BILLS
      return itemToBill.has(row.item_id) ? [itemToBill.get(row.item_id)] : null
    }

    return ALL_BILLS
  }

  function isRelevant(table, payload) {
    return affectedBills(table, payload) !== null
  }

  return { learn, affectedBills, isRelevant }
}
