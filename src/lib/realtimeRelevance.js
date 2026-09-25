// Realtime can't filter items/item_shares by group (they only carry
// bill_id/item_id), and delete events carry nothing but the row's primary
// key — so every open page used to reload for changes in *any* of the
// user's groups. This tracks which bill and item ids belong to the page
// and answers "can this event affect us?".
//
// Deliberately errs towards "yes":
//   - until the first real load has been learned, everything counts;
//   - ids are never forgotten (a deleted id lingering only costs a
//     harmless extra reload);
//   - a new bill/item is learned from its own INSERT event, so the
//     shares that follow it a moment later aren't dropped while the
//     reload that will include them is still in flight.
// Anything it wrongly ignores is caught by the periodic resync.
export function createRealtimeRelevance() {
  const billIds = new Set()
  const itemIds = new Set()
  let ready = false

  function learn(bills) {
    for (const bill of bills || []) {
      billIds.add(bill.id)
      for (const item of bill.items || []) itemIds.add(item.id)
    }
    ready = true
  }

  function isRelevant(table, payload) {
    const { eventType } = payload
    const row = eventType === 'DELETE' ? payload.old || {} : payload.new || {}

    if (table === 'bills') {
      // INSERT/UPDATE subscriptions are filtered to this group server-side;
      // a DELETE only carries the id, so check it's one of ours.
      if (eventType === 'DELETE') return !ready || billIds.has(row.id)
      if (row.id) billIds.add(row.id)
      return true
    }

    if (table === 'items') {
      if (eventType === 'DELETE') return !ready || itemIds.has(row.id)
      if (billIds.has(row.bill_id)) {
        itemIds.add(row.id)
        return true
      }
      return !ready
    }

    if (table === 'item_shares') {
      // item_id is part of the primary key, so it's present even on DELETE.
      return !ready || itemIds.has(row.item_id)
    }

    return true
  }

  return { learn, isRelevant }
}
