// WhatsApp (and most chat apps) render *asterisks* as bold and _underscores_
// as italic in plain text — so these lean on that instead of markdown,
// which wouldn't render there at all.

export function formatBillRecap(bill, items, members) {
  const nameOf = (id) => members.find((m) => m.id === id)?.name || 'Someone'
  const lines = [`*${bill?.title || 'Bill'}*`]
  if (bill?.paid_by) lines.push(`Paid by ${nameOf(bill.paid_by)}`)
  if (bill?.note) lines.push(`_${bill.note}_`)
  lines.push('')

  let total = 0
  for (const item of items) {
    const price = Number(item.total_price)
    total += price
    const buyers = (item.item_shares || []).map((s) => nameOf(s.member_id))
    const qtyLabel = Number(item.quantity) > 1 ? ` x${item.quantity}` : ''
    const splitLabel = buyers.length ? ` (${buyers.join(', ')})` : ' (unassigned)'
    lines.push(`${item.name}${qtyLabel} — €${price.toFixed(2)}${splitLabel}`)
  }

  lines.push('')
  lines.push(`*Total: €${total.toFixed(2)}*`)
  return lines.join('\n')
}

export function formatSettlementRecap(groupName, transactions, members) {
  const nameOf = (id) => members.find((m) => m.id === id)?.name || 'Someone'
  const lines = [`*Settle up — ${groupName}*`, '']

  if (!transactions || transactions.length === 0) {
    lines.push("Everyone's even — nothing to settle.")
  } else {
    for (const t of transactions) {
      lines.push(`${nameOf(t.from)} owes ${nameOf(t.to)} €${t.amount.toFixed(2)}`)
    }
  }

  return lines.join('\n')
}
