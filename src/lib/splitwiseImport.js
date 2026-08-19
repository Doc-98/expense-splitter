import { parseCsv } from './csv'

// Splitwise's group export is: Date, Description, Category, Cost, Currency,
// then one column per group member — where each person's cell is their NET
// balance for that expense (positive = they're owed, negative = they owe),
// not a raw share amount. Confirmed against Splitwise's own current export
// format. One row per expense; no per-item detail (Splitwise doesn't track
// individual line items the way this app does), so each imported expense
// becomes one bill with a single item covering the whole cost.
export function parseSplitwiseCsv(text) {
  const rows = parseCsv(text)
  if (rows.length < 2) {
    return { peopleNames: [], expenses: [], warnings: ['That file looks empty.'] }
  }

  const header = rows[0].map((h) => h.trim())
  const dataRows = rows.slice(1)

  const lower = header.map((h) => h.toLowerCase())
  const dateIdx = lower.indexOf('date')
  const descIdx = lower.indexOf('description')
  const categoryIdx = lower.indexOf('category')
  const costIdx = lower.indexOf('cost')
  const currencyIdx = lower.indexOf('currency')

  if (dateIdx === -1 || descIdx === -1 || costIdx === -1) {
    return {
      peopleNames: [],
      expenses: [],
      warnings: ["This doesn't look like a Splitwise export — missing Date/Description/Cost columns."],
    }
  }

  const knownIndexes = new Set([dateIdx, descIdx, categoryIdx, costIdx, currencyIdx].filter((i) => i !== -1))
  const peopleColumns = header
    .map((name, index) => ({ name, index }))
    .filter((c) => !knownIndexes.has(c.index) && c.name)

  const warnings = []
  const currenciesSeen = new Set()
  const expenses = []

  for (const row of dataRows) {
    const description = row[descIdx]?.trim()
    // Splitwise appends a trailing running-total row with no real expense
    // in it — skip it rather than importing a fake bill.
    if (!description || description.toLowerCase().includes('total balance')) continue

    const cost = Number(row[costIdx])
    if (!Number.isFinite(cost) || cost <= 0) {
      warnings.push(`Skipped "${description}" — couldn't read a valid cost.`)
      continue
    }

    if (currencyIdx !== -1 && row[currencyIdx]) currenciesSeen.add(row[currencyIdx].trim())

    const netByPerson = {}
    let rowOk = true
    for (const col of peopleColumns) {
      const raw = row[col.index]
      const value = raw === undefined || raw.trim() === '' ? 0 : Number(raw)
      if (!Number.isFinite(value)) {
        warnings.push(`Skipped "${description}" — couldn't read ${col.name}'s share.`)
        rowOk = false
        break
      }
      netByPerson[col.name] = value
    }
    if (!rowOk) continue

    // The person with the largest positive net fronted the money. This is
    // the one place a single-payer assumption gets made — Splitwise's
    // export only gives net balance per expense, not a separate "who
    // actually paid" field. True multi-payer expenses (uncommon) would
    // import with only the biggest contributor credited as payer.
    let payerName = null
    let payerNet = 0
    for (const [name, net] of Object.entries(netByPerson)) {
      if (net > payerNet) {
        payerName = name
        payerNet = net
      }
    }

    if (!payerName) {
      warnings.push(`Skipped "${description}" — couldn't tell who paid.`)
      continue
    }

    // Reconstruct each person's actual share of the cost (not their net
    // balance) — for the payer: what they paid minus what they netted;
    // for everyone else: the negative of their net balance. Used as the
    // item_shares "shares" weight directly, in currency units rather than
    // an abstract ratio — the proportional split math produces exactly
    // these amounts back out again either way, since the weights are only
    // ever used relative to each other.
    const shares = {}
    for (const [name, net] of Object.entries(netByPerson)) {
      if (name === payerName) {
        const share = cost - net
        if (share > 0.001) shares[name] = share
      } else if (net < -0.001) {
        shares[name] = -net
      }
    }

    const parsedDate = new Date(row[dateIdx])
    expenses.push({
      date: Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString(),
      rawDate: row[dateIdx],
      description,
      category: categoryIdx !== -1 ? row[categoryIdx]?.trim() : '',
      cost,
      payerName,
      shares,
    })
  }

  if (currenciesSeen.size > 1) {
    warnings.push(
      `This file mixes currencies (${[...currenciesSeen].join(', ')}) — every amount will be imported as a plain number, so double check nothing got mixed up.`
    )
  }

  return { peopleNames: peopleColumns.map((c) => c.name), expenses, warnings }
}
