// Deliberately plain localStorage, not synced via Supabase — same
// reasoning as scan settings/stats preferences: a per-device "how I like
// to add a bill" preference, not data that needs to follow you anywhere.
//
// Two independent flags rather than one: groups and the personal space
// are used differently enough (a personal-space bill is overwhelmingly a
// single purchase; a group bill is more of a toss-up) that defaulting
// them together would mean whichever one you actually wanted to turn off
// takes the other down with it.
const STORAGE_KEY = 'spesa-bill-creation-preferences'

const DEFAULTS = {
  // Whether "Add bill" shows the optional quick-Amount field — filling it
  // creates the bill with one item already in place (see GroupView.jsx's
  // createBill), landing on its simple one-item view; leaving it blank
  // (or turning this off entirely) creates the bill with no items yet,
  // same as this app has always done.
  quickAmountInGroups: true,
  quickAmountInPersonal: true,
}

export function getBillCreationPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

export function setBillCreationPreferences(partial) {
  const next = { ...getBillCreationPreferences(), ...partial }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}
