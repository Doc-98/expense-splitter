// Pure, no AI needed — recognizes money you've probably already imported
// once already (this statement's period overlapping one you imported last
// time, in this group or another). Offered as a suggestion in
// ImportBankStatement.jsx's review step, never applied silently — a false
// positive here just costs one extra click to override, which is a far
// smaller problem than a false negative silently duplicating a bill.
//
// This used to also detect likely-recurring charges (a candidate for a
// Recurring Bill template) by clustering same-description-and-amount
// transactions on a regular cadence. Removed — in practice it clustered
// unrelated purchases that happened to share a payment processor's own
// generic descriptor (every PayPal-routed direct debit reads as "PayPal
// Europe S.a.r.l. et Cie S.C.A" regardless of what was actually bought, so
// two coincidentally same-amount purchases through PayPal looked
// "recurring" with nothing recurring about them). That's not a tunable
// false-positive rate to fix — the bank statement's own description field
// genuinely doesn't carry the distinguishing information in that case, so
// no amount of smarter matching here could have told them apart. Setting
// up a real Recurring Bill by hand (Group Settings → Recurring Bills)
// isn't affected by any of this.

// Strips reference numbers, card-terminal codes, and punctuation down to
// the words a merchant name is actually made of, then keeps only the
// first few — a real merchant name rarely needs more than that to tell
// apart from another, and truncating consistently is what lets two
// slightly different printings of the same merchant ("AMAZON MKTPLACE
// PMTS" vs. "AMAZON MKTPLACE PMTS*UK 123456") still cluster together.
function normalizeDescription(description) {
  return (description || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ') // drop digits and punctuation — reference numbers, dates, card codes
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 3)
    .join(' ')
}

const DAY_MS = 24 * 60 * 60 * 1000

// A transaction counts as a likely duplicate when its normalized
// description and amount match an existing bill within a few days — not
// an exact date match, since a transaction can post a day or two after it
// actually happened depending on the bank, and this app's own bill date is
// whatever was picked at import time, which might not be the literal
// statement date either. Checked against any direction, not just debits —
// re-importing an overlapping statement can just as easily duplicate a
// credit (a refund, say) that was already brought in as its own bill.
const DUPLICATE_WINDOW_DAYS = 3

export function findDuplicateIndexes(newTransactions, existingBills = []) {
  const duplicates = new Set()
  for (let i = 0; i < newTransactions.length; i++) {
    const tx = newTransactions[i]
    const key = normalizeDescription(tx.description)
    if (!key) continue
    const txDate = new Date(tx.date)
    const isDuplicate = existingBills.some((b) => {
      if (normalizeDescription(b.description) !== key) return false
      if (Math.abs(b.amount - tx.amount) > 0.01) return false
      const gapDays = Math.abs(new Date(b.date) - txDate) / DAY_MS
      return gapDays <= DUPLICATE_WINDOW_DAYS
    })
    if (isDuplicate) duplicates.add(i)
  }
  return duplicates
}

// A different kind of duplicate than findDuplicateIndexes above: not "did
// I already import this exact statement," but "did I already record this
// same real-world expense as a bill in one of my *other* groups" — you
// paid for something with a friend, it's already sitting in that group's
// bill list, and now it's also showing up here on your own bank
// statement. A shared bill's title ("Dinner with roommates," typed by a
// person) has no reason to resemble the bank's own wording for the same
// charge ("RESTAURANT XYZ 4821"), so this deliberately does *not* require
// a description match the way the same-statement check does — just the
// amount, and the date within a few days either way. That's a real
// tradeoff (a coincidental same-amount, same-week purchase in another
// group would false-positive) but the safer one for a destructive-if-
// missed case: a flagged row is still just one click to keep, an unflagged
// real duplicate is money counted twice with nothing pointing at it.
//
// `otherGroupBills` is `{ amount, date, groupName }[]` — see
// ImportBankStatement.jsx's loadCrossGroupBills for why it's fetched in a
// tight window around the statement's own date range rather than each
// other group's full history ("trust the date match" — no reason to
// search further than the wiggle room itself covers).
const CROSS_GROUP_WINDOW_DAYS = 3

export function findCrossGroupMatches(newTransactions, otherGroupBills = []) {
  const matches = new Map() // transaction index -> groupName
  for (let i = 0; i < newTransactions.length; i++) {
    const tx = newTransactions[i]
    const txDate = new Date(tx.date)
    const match = otherGroupBills.find((b) => {
      if (Math.abs(b.amount - tx.amount) > 0.01) return false
      const gapDays = Math.abs(new Date(b.date) - txDate) / DAY_MS
      return gapDays <= CROSS_GROUP_WINDOW_DAYS
    })
    if (match) matches.set(i, match.groupName)
  }
  return matches
}
