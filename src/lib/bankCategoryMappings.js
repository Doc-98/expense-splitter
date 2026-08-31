// Remembers, per group and per device, how a bank's own statement category
// names ("Alimentazione", "Grocery", …) map to this app's own categories —
// filled in once via ImportBankStatement.jsx's "Match bank categories" step,
// then reused silently on every later import from the same bank, so a
// person is only ever asked about a given bank category name once, not once
// per statement.
//
// Plain localStorage, not a database table — same reasoning as
// receiptSettings.js: this is one device's own view of how a bank's wording
// lines up with this group's categories, nothing that needs to sync across
// devices or have RLS reasoned about.
//
// Keyed by group first, since two groups can (and often do) name or
// organize their categories differently — the same bank category name can
// reasonably map to a different app category, or to none, per group.

const STORAGE_KEY = 'spesa-bank-category-mappings'

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeAll(all) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // Storage full or unavailable — mappings just won't be remembered for
    // next time, no worse off than before this existed.
  }
}

// { [lowercased bank category name]: categoryId | null } for this group.
// A value of null means "already told to leave this one uncategorized" —
// deliberately distinct from the key being absent (never asked about at
// all), so that choice sticks too instead of asking again next import.
export function getBankCategoryMappings(groupId) {
  return readAll()[groupId] || {}
}

// Persists one group's set of hint -> categoryId|null choices in a single
// write — called once when the "Match bank categories" step is confirmed,
// not per hint.
export function saveBankCategoryMappings(groupId, mappings) {
  const all = readAll()
  all[groupId] = { ...(all[groupId] || {}), ...mappings }
  writeAll(all)
}
