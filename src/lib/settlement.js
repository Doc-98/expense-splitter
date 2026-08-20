// Turns a group's bills/items/shares into "who owes whom, how much".
//
// Model:
// - Each bill was fronted by either one person (paid_by) or several
//   (bill.payers, each with their own contributed amount) — see
//   creditPayers() below, the one place that distinction is handled.
// - Each item's total_price is split among its item_shares, proportional to
//   each person's `shares` value (so someone buying 2 of 3 units owes double).
// - A person's net balance = (money they fronted) - (their share of costs).
//   Positive = they're owed money. Negative = they owe money.

function round2(n) {
  return Math.round(n * 100) / 100
}

function groupBy(list, key) {
  return list.reduce((acc, entry) => {
    const k = entry[key]
    acc[k] = acc[k] || []
    acc[k].push(entry)
    return acc
  }, {})
}

// Credits whoever fronted a bill's money. A bill either has a single
// paid_by, or — once switched to "multiple payers" in the UI — a
// bill.payers array of {member_id, amount}, in which case paid_by is
// ignored entirely and each payer is credited their own contributed
// amount instead of the whole bill total. This is the one place that
// distinction lives, so every caller below stays oblivious to it.
function creditPayers(bill, billTotal, credit) {
  if (bill.payers && bill.payers.length > 0) {
    for (const payer of bill.payers) {
      credit(payer.member_id, Number(payer.amount))
    }
  } else if (bill.paid_by) {
    credit(bill.paid_by, billTotal)
  }
}

export function computeBalances({ bills, items, itemShares, payments = [] }) {
  const balances = {}
  // Accumulate in full floating-point precision; round only once, at the
  // very end. Rounding after every single addition (as an earlier version
  // did) can compound tiny drift across many operations — harmless for a
  // handful of transactions, but there's no reason not to do this properly.
  const add = (userId, amount) => {
    if (!userId) return
    balances[userId] = (balances[userId] || 0) + amount
  }

  const itemsByBill = groupBy(items, 'bill_id')
  for (const bill of bills) {
    const billItems = itemsByBill[bill.id] || []
    const billTotal = billItems.reduce((sum, it) => sum + Number(it.total_price), 0)
    creditPayers(bill, billTotal, add)
  }

  const sharesByItem = groupBy(itemShares, 'item_id')
  for (const item of items) {
    const shares = sharesByItem[item.id] || []
    const totalShares = shares.reduce((sum, s) => sum + Number(s.shares), 0)
    if (totalShares <= 0) continue
    for (const share of shares) {
      const portion = (Number(item.total_price) * Number(share.shares)) / totalShares
      add(share.user_id, -portion)
    }
  }

  // A recorded payment from X to Y reduces what X owes (or increases what
  // they're owed) by that amount, and does the opposite for Y.
  for (const payment of payments) {
    add(payment.from_user, Number(payment.amount))
    add(payment.to_user, -Number(payment.amount))
  }

  for (const userId of Object.keys(balances)) {
    balances[userId] = round2(balances[userId])
  }

  return balances
}

// Raw spending totals per person, for a stats view — deliberately separate
// from computeBalances/payments, since "how much have I spent" and "who
// owes whom right now" are different questions. Returns, per user:
// - paid: total money they've fronted (sum of bills where they're paid_by,
//   or their own contribution on a multi-payer bill)
// - consumed: total value of their own share of items, across all bills
export function computeSpendingTotals({ bills, items, itemShares }) {
  const totals = {}
  const ensure = (userId) => {
    if (!totals[userId]) totals[userId] = { paid: 0, consumed: 0 }
    return totals[userId]
  }

  const itemsByBill = groupBy(items, 'bill_id')
  for (const bill of bills) {
    const billItems = itemsByBill[bill.id] || []
    const billTotal = billItems.reduce((sum, it) => sum + Number(it.total_price), 0)
    creditPayers(bill, billTotal, (userId, amount) => {
      ensure(userId).paid += amount
    })
  }

  const sharesByItem = groupBy(itemShares, 'item_id')
  for (const item of items) {
    const shares = sharesByItem[item.id] || []
    const totalShares = shares.reduce((sum, s) => sum + Number(s.shares), 0)
    if (totalShares <= 0) continue
    for (const share of shares) {
      const portion = (Number(item.total_price) * Number(share.shares)) / totalShares
      ensure(share.user_id).consumed += portion
    }
  }

  for (const userId of Object.keys(totals)) {
    totals[userId].paid = round2(totals[userId].paid)
    totals[userId].consumed = round2(totals[userId].consumed)
  }

  return totals
}

// One person's paid/consumed totals, bucketed by exact calendar day. This is
// what a "departure snapshot" stores when someone leaves a group — days are
// the one bucket size that always nests cleanly into weeks, months, AND
// years with no fuzzy splitting, so summing the right days later correctly
// reconstructs a total for any of those coarser views, forever, without
// needing to keep the group's underlying data queryable.
export function computeDailyTotalsForUser(userId, { bills, items, itemShares }) {
  const daily = {}
  const ensure = (key) => {
    if (!daily[key]) daily[key] = { paid: 0, consumed: 0 }
    return daily[key]
  }
  // Local calendar day, not UTC — has to match how getPeriodRange() builds
  // its week/month/year boundaries (also local time), or a late-night bill
  // could get bucketed under the wrong day for anyone outside UTC.
  const dayKey = (dateStr) => {
    const d = new Date(dateStr)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const billById = new Map(bills.map((b) => [b.id, b]))

  const itemsByBill = groupBy(items, 'bill_id')
  for (const bill of bills) {
    const billItems = itemsByBill[bill.id] || []
    const billTotal = billItems.reduce((sum, it) => sum + Number(it.total_price), 0)
    creditPayers(bill, billTotal, (payerId, amount) => {
      if (payerId !== userId) return
      ensure(dayKey(bill.created_at)).paid += amount
    })
  }

  const sharesByItem = groupBy(itemShares, 'item_id')
  for (const item of items) {
    const shares = sharesByItem[item.id] || []
    const totalShares = shares.reduce((sum, s) => sum + Number(s.shares), 0)
    if (totalShares <= 0) continue
    const myShare = shares.find((s) => s.user_id === userId)
    if (!myShare) continue
    const bill = billById.get(item.bill_id)
    if (!bill) continue
    const portion = (Number(item.total_price) * Number(myShare.shares)) / totalShares
    ensure(dayKey(bill.created_at)).consumed += portion
  }

  for (const key of Object.keys(daily)) {
    daily[key].paid = round2(daily[key].paid)
    daily[key].consumed = round2(daily[key].consumed)
  }

  return daily
}

// Greedy debt simplification: repeatedly match the biggest creditor with the
// biggest debtor. Produces close to the minimum number of payments needed to
// settle the whole group, instead of everyone paying everyone.
export function simplifyDebts(balances) {
  const creditors = []
  const debtors = []

  for (const [userId, amount] of Object.entries(balances)) {
    if (amount > 0.01) creditors.push({ userId, amount })
    else if (amount < -0.01) debtors.push({ userId, amount: -amount })
  }

  creditors.sort((a, b) => b.amount - a.amount)
  debtors.sort((a, b) => b.amount - a.amount)

  const transactions = []
  let i = 0
  let j = 0

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]
    const creditor = creditors[j]
    const amount = round2(Math.min(debtor.amount, creditor.amount))

    if (amount > 0) {
      transactions.push({ from: debtor.userId, to: creditor.userId, amount })
    }

    debtor.amount = round2(debtor.amount - amount)
    creditor.amount = round2(creditor.amount - amount)

    if (debtor.amount <= 0.01) i++
    if (creditor.amount <= 0.01) j++
  }

  return transactions
}
