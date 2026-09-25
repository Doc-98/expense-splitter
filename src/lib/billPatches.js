// Per-bill updates for the group page: instead of re-downloading the whole
// group (~800 KB for the largest one) when one item changes, fetch just the
// bills a change touched and merge them into the list. The full reload stays
// the backstop — see GroupView.jsx's syncBills for when it still runs.

// Patching is on; a verification full fetch follows each burst of patches
// and logs any difference to the console. Both switches are here so either
// can be turned off in one line.
export const BILL_PATCHING_ENABLED = true
export const VERIFY_BILL_PATCHES = true

// More than this many bills touched at once (a bulk delete, an import) and
// a full reload is simpler and no more expensive.
export const MAX_PATCH_BILLS = 20

// What's queued for the group page's next sync.
export function emptyPending() {
  return { full: false, billIds: new Set(), verify: false }
}

// Queues the result of relevance.affectedBills(): null (not ours) queues
// nothing, ALL_BILLS ('all') a full reload, otherwise the bill ids.
// Returns whether anything was queued.
export function queueAffected(pending, affected) {
  if (!affected) return false
  if (affected === 'all') pending.full = true
  else for (const id of affected) pending.billIds.add(id)
  return true
}

// Decides what one sync run does with what's queued. A full reload wins
// over everything, and anything uncertain becomes one: no complete list
// loaded yet, patching switched off, or too many bills at once.
export function planSync(pending, { fullyLoaded, enabled = BILL_PATCHING_ENABLED, maxBills = MAX_PATCH_BILLS }) {
  const billIds = [...pending.billIds]
  if (pending.full) return { kind: 'full' }
  if (billIds.length > 0) {
    if (!enabled || !fullyLoaded || billIds.length > maxBills) return { kind: 'full' }
    return { kind: 'patch', billIds }
  }
  if (pending.verify) return { kind: 'verify' }
  return { kind: 'none' }
}

// "2026-09-24T09:33:33.421039+00:00" -> [epoch ms, microseconds within that
// ms]. Postgres keeps microseconds, Date.parse only milliseconds; two bills
// a few microseconds apart must still sort exactly like the server does.
function timeKey(timestamp) {
  const ms = Date.parse(timestamp)
  const fraction = /\.(\d+)/.exec(timestamp)?.[1] ?? ''
  const micros = Number(fraction.padEnd(6, '0').slice(3, 6))
  return [ms, micros]
}

// Same order as get_group_bills: created_at desc, then id desc. Lowercase
// UUID strings compare in the same order as their bytes.
export function compareBills(a, b) {
  const [msA, microA] = timeKey(a.created_at)
  const [msB, microB] = timeKey(b.created_at)
  if (msA !== msB) return msB - msA
  if (microA !== microB) return microB - microA
  if (a.id === b.id) return 0
  return a.id < b.id ? 1 : -1
}

// `requestedIds` are the bills that were asked for; `fetchedBills` is what
// came back. Asked for but not returned means it's gone (deleted, or never
// in this group) — so it's removed. Returned bills replace their old copy
// and are placed by date, which also handles a bill whose date was edited.
// Never mutates its inputs.
export function applyBillPatch(bills, requestedIds, fetchedBills) {
  const requested = new Set(requestedIds)
  const kept = bills.filter((bill) => !requested.has(bill.id))
  const incoming = fetchedBills.filter((bill) => requested.has(bill.id)).sort(compareBills)
  if (incoming.length === 0) return kept

  const merged = []
  let i = 0
  let j = 0
  while (i < kept.length && j < incoming.length) {
    if (compareBills(kept[i], incoming[j]) <= 0) merged.push(kept[i++])
    else merged.push(incoming[j++])
  }
  while (i < kept.length) merged.push(kept[i++])
  while (j < incoming.length) merged.push(incoming[j++])
  return merged
}

// Order-sensitive comparison of two bill lists, for the verification fetch.
// Returns the ids that differ (missing, extra, changed or out of place) —
// empty when identical.
export function diffBillLists(expected, actual) {
  const differing = new Set()
  const length = Math.max(expected.length, actual.length)
  for (let k = 0; k < length; k++) {
    const a = expected[k]
    const b = actual[k]
    if (!a || !b || a.id !== b.id || stableStringify(canonical(a)) !== stableStringify(canonical(b))) {
      if (a) differing.add(a.id)
      if (b) differing.add(b.id)
    }
  }
  return [...differing]
}

// Nested arrays come back from Postgres in no guaranteed order; sort them
// so two copies of the same bill always serialize identically.
function canonical(bill) {
  const byKey = (key) => (x, y) => String(x[key]).localeCompare(String(y[key]))
  const items = (bill.items || [])
    .map((item) => ({ ...item, item_shares: [...(item.item_shares || [])].sort(byKey('member_id')) }))
    .sort(byKey('id'))
  const payers = [...(bill.bill_payers || [])].sort(byKey('member_id'))
  return { ...bill, items, bill_payers: payers }
}

// JSON.stringify with object keys sorted at every level, so key order
// can't make two equal bills look different.
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
