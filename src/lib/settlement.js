// Turns a group's bills/items/shares into "who owes whom, how much".
//
// Model:
// - Each bill has one payer (paid_by) who fronted the money.
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
    add(bill.paid_by, billTotal)
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
