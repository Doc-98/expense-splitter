// WhatsApp (and most chat apps) render *asterisks* as bold and _underscores_
// as italic in plain text — so these lean on that instead of markdown,
// which wouldn't render there at all.
//
// Both functions take a `formatMoney` function rather than reading currency
// from anywhere themselves — they're plain functions, not components, so
// they can't use the useCurrency() hook directly; the caller (which *is*
// a component) passes its own formatter straight through.

export function formatBillRecap(bill, items, members, formatMoney) {
  const nameOf = (id) => members.find((m) => m.id === id)?.name || 'Someone'
  const lines = [`*${bill?.title || 'Bill'}*`]
  if (bill?.payers?.length > 0) {
    const payerText = bill.payers.map((p) => `${nameOf(p.member_id)} (${formatMoney(p.amount)})`).join(', ')
    lines.push(`Paid by ${payerText}`)
  } else if (bill?.paid_by) {
    lines.push(`Paid by ${nameOf(bill.paid_by)}`)
  }
  if (bill?.note) lines.push(`_${bill.note}_`)
  lines.push('')

  let total = 0
  for (const item of items) {
    const price = Number(item.total_price)
    total += price
    const buyers = (item.item_shares || []).map((s) => nameOf(s.member_id))
    const qtyLabel = Number(item.quantity) > 1 ? ` x${item.quantity}` : ''
    const splitLabel = buyers.length ? ` (${buyers.join(', ')})` : ' (unassigned)'
    lines.push(`${item.name}${qtyLabel} — ${formatMoney(price)}${splitLabel}`)
  }

  lines.push('')
  lines.push(`*Total: ${formatMoney(total)}*`)
  return lines.join('\n')
}

// Shares a handful of selected bills as one message — a single selection
// just delegates straight to formatBillRecap so it reads identically to
// sharing that one bill from its own page, while more than one gets a
// count header, each bill's own recap divided by a plain "—" (readable in
// a chat app without relying on any markdown a divider might need), and a
// grand total at the end. Bills are shared in whatever order they're
// passed in — the caller decides that (typically the same newest-first
// order the list itself displays), this just doesn't second-guess it.
export function formatMultiBillRecap(bills, members, formatMoney) {
  if (!bills || bills.length === 0) return 'No bills selected.'
  if (bills.length === 1) {
    const bill = bills[0]
    return formatBillRecap(bill, bill.items || [], members, formatMoney)
  }

  const lines = [`*${bills.length} bills*`, '']
  let grandTotal = 0
  bills.forEach((bill, i) => {
    const items = bill.items || []
    grandTotal += items.reduce((sum, item) => sum + Number(item.total_price), 0)
    lines.push(formatBillRecap(bill, items, members, formatMoney))
    if (i < bills.length - 1) lines.push('', '—', '')
  })
  lines.push('', `*Grand total: ${formatMoney(grandTotal)}*`)
  return lines.join('\n')
}

export function formatSettlementRecap(groupName, transactions, members, formatMoney) {
  const nameOf = (id) => members.find((m) => m.id === id)?.name || 'Someone'
  const lines = [`*Settle up — ${groupName}*`, '']

  if (!transactions || transactions.length === 0) {
    lines.push("Everyone's even — nothing to settle.")
  } else {
    for (const t of transactions) {
      lines.push(`${nameOf(t.from)} owes ${nameOf(t.to)} ${formatMoney(t.amount)}`)
    }
  }

  return lines.join('\n')
}

// Both stats recaps below take their rows already fully resolved (names
// looked up, month keys turned into labels, etc.) — GroupStats.jsx and
// AccountStats.jsx both already have all of that on hand from what's on
// screen, so there's nothing left for these to look up themselves. Same
// row shapes feed the printable versions of each (PrintableRecap.jsx),
// built once per page rather than twice.
export function formatGroupStatsRecap(
  { groupName, periodLabel, groupTotal, billCount, avgBill, peopleRows, categoryRows, monthlyRows, biggestBills },
  formatMoney
) {
  const lines = [`*Stats — ${groupName}*`, `_${periodLabel}_`, '']
  lines.push(`Total spent: ${formatMoney(groupTotal)}`)
  lines.push(`${billCount} bill${billCount === 1 ? '' : 's'} — avg ${formatMoney(avgBill)}`)

  if (peopleRows.length > 0) {
    lines.push('', '*By person*')
    for (const p of peopleRows) lines.push(`${p.name} — fronted ${formatMoney(p.fronted)}, share ${formatMoney(p.share)}`)
  }

  if (categoryRows.length > 0) {
    lines.push('', '*By category*')
    for (const c of categoryRows) lines.push(`${c.name} — ${formatMoney(c.amount)}`)
  }

  if (monthlyRows.length > 0) {
    lines.push('', '*By month*')
    for (const m of monthlyRows) lines.push(`${m.label} — ${formatMoney(m.amount)}`)
  }

  if (biggestBills.length > 0) {
    lines.push('', '*Biggest bills*')
    for (const b of biggestBills) lines.push(`${b.title} (${b.paidByLabel}) — ${formatMoney(b.total)}`)
  }

  return lines.join('\n')
}

export function formatAccountStatsRecap(
  { periodLabel, paid, consumed, overallBalance, categoryRows, byGroupRows, monthlyRows },
  formatMoney
) {
  const lines = ['*Your stats*', `_${periodLabel}_`, '']
  lines.push(`You fronted: ${formatMoney(paid)}`)
  lines.push(`Your share: ${formatMoney(consumed)}`)
  lines.push(`Overall balance (now): ${overallBalance >= 0 ? '+' : ''}${formatMoney(overallBalance)}`)

  if (categoryRows.length > 0) {
    lines.push('', '*By category*')
    for (const c of categoryRows) lines.push(`${c.name} — ${formatMoney(c.amount)}`)
  }

  if (byGroupRows.length > 0) {
    lines.push('', '*By group*')
    for (const g of byGroupRows) lines.push(`${g.name} — fronted ${formatMoney(g.fronted)}, share ${formatMoney(g.share)}`)
  }

  if (monthlyRows.length > 0) {
    lines.push('', '*By month (fronted)*')
    for (const m of monthlyRows) lines.push(`${m.label} — ${formatMoney(m.amount)}`)
  }

  return lines.join('\n')
}
