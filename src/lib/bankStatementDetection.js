// Pure, no AI needed — recognizes two different kinds of pattern in a bank
// statement import: money that's probably the same recurring charge you've
// paid before (a candidate for a Recurring Bill template, not just a
// one-off import), and money you've probably already imported once already
// (this statement's period overlapping one you imported last time). Both
// are offered as suggestions in ImportBankStatement.jsx's review step,
// never applied silently — a false positive here just costs one extra
// click to override, which is a far smaller problem than a false negative
// silently duplicating a bill or missing an obvious subscription.

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

// Median gap between consecutive dates, in days — the median rather than
// the mean so one unusually early or late occurrence (a subscription
// charged a few days off its usual date one month) doesn't skew the
// frequency guess.
function medianGapDays(sortedDates) {
  if (sortedDates.length < 2) return null
  const gaps = []
  for (let i = 1; i < sortedDates.length; i++) {
    gaps.push((sortedDates[i] - sortedDates[i - 1]) / DAY_MS)
  }
  gaps.sort((a, b) => a - b)
  const mid = Math.floor(gaps.length / 2)
  return gaps.length % 2 === 0 ? (gaps[mid - 1] + gaps[mid]) / 2 : gaps[mid]
}

// Classifies a median gap into one of this app's own recurring-bill
// frequencies (see the `frequency` check constraint on recurring_bills in
// schema.sql) — generous tolerances since a "monthly" charge can land
// anywhere from the 28th to the 31st depending on the month, and a
// "weekly" one can slip a day or two around a weekend. Anything that
// doesn't land cleanly in one of these bands isn't guessed at.
function frequencyForGap(days) {
  if (days >= 5 && days <= 9) return 'weekly'
  if (days >= 25 && days <= 35) return 'monthly'
  if (days >= 350 && days <= 380) return 'yearly'
  return null
}

// `newTransactions` — this import's own debits, { date, description,
// amount }. `existingDebits` — the personal group's own past bills,
// already normalized to that same shape (see ImportBankStatement.jsx's
// history load) — lets a pattern that spans further back than just this
// one statement still be recognized, without ever touching or
// re-suggesting anything for those old bills themselves. Clustered by
// normalized description *and* exact amount — subscriptions, rent, and
// memberships are almost always billed for the identical amount every
// time, so this favors precision (missing a utility bill that genuinely
// varies month to month) over recall (guessing a pattern that isn't
// really there).
//
// Returns one entry per merchant+amount combination that looks recurring,
// with which of *this batch's* transactions belong to it (by index) and a
// suggested frequency — never the existing bills themselves, which are
// only here to inform the detection, not to be re-offered.
export function detectRecurringClusters(newTransactions, existingDebits = []) {
  const byKey = new Map()

  function addOccurrence(description, amount, date, isNew, txIndex) {
    const normalized = normalizeDescription(description)
    if (!normalized) return
    const key = `${normalized}|${amount.toFixed(2)}`
    if (!byKey.has(key)) byKey.set(key, { description, amount, occurrences: [] })
    byKey.get(key).occurrences.push({ date: new Date(date), isNew, txIndex })
  }

  existingDebits.forEach((b) => addOccurrence(b.description, b.amount, b.date, false))
  newTransactions.forEach((t, i) => addOccurrence(t.description, t.amount, t.date, true, i))

  const clusters = []
  for (const { description, amount, occurrences } of byKey.values()) {
    if (occurrences.length < 2) continue
    const newIndexes = occurrences.filter((o) => o.isNew).map((o) => o.txIndex)
    if (newIndexes.length === 0) continue // nothing in *this* batch to actually offer

    const sortedDates = occurrences.map((o) => o.date).sort((a, b) => a - b)
    const gap = medianGapDays(sortedDates)
    const frequency = gap === null ? null : frequencyForGap(gap)
    if (!frequency) continue // no clean, regular cadence — don't guess

    clusters.push({
      description,
      amount,
      occurrenceCount: occurrences.length,
      frequency,
      newTransactionIndexes: newIndexes,
      // The most recent occurrence across *all* of them (old bills
      // included) — what a caller offering "set this up as a Recurring
      // Bill" needs to compute the template's first still-in-the-future
      // due date from (via advanceDate() in recurringBills.js), not just
      // the latest one in this batch.
      latestDate: sortedDates[sortedDates.length - 1],
    })
  }

  return clusters
}

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
