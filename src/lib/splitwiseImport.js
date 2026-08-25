import { parseCsv } from './csv'
import { computeBalances } from './settlement'

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
    return { peopleNames: [], expenses: [], needsReview: [], finalBalances: {}, warnings: ['That file looks empty.'] }
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
      needsReview: [],
      finalBalances: {},
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
  // Rows where the net-balance numbers alone can't tell us who actually
  // paid, or how a multi-person expense should split — either nobody has
  // a positive net (a personal expense someone logged for their own
  // tracking, where they paid and consumed the exact same amount, so
  // their own net comes out to precisely 0 — indistinguishable in the
  // numbers from "not involved at all"), or more than one person does (a
  // real multiple-payer expense, but Splitwise's net-balance export
  // doesn't say how much each of them actually put in). Both go to
  // ImportBills.jsx's review step instead of being guessed at or silently
  // dropped.
  const needsReview = []
  // Splitwise's own trailing "Total balance" row, one column per person —
  // not a real expense, but the one place the CSV states each person's
  // own all-time net directly, so it's captured here (not skipped) for
  // checkImportBalances() below to compare the finished import against.
  let finalBalances = {}

  for (const row of dataRows) {
    const description = row[descIdx]?.trim()
    if (!description) continue

    if (description.toLowerCase().includes('total balance')) {
      for (const col of peopleColumns) {
        const raw = row[col.index]
        const value = raw === undefined || raw.trim() === '' ? 0 : Number(raw)
        if (Number.isFinite(value)) finalBalances[col.name] = value
      }
      continue
    }

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

    const parsedDate = new Date(row[dateIdx])
    const date = Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString()
    const category = categoryIdx !== -1 ? row[categoryIdx]?.trim() : ''

    // The one person with a positive net fronted the money — this is the
    // only shape Splitwise's per-row net balances can be reconstructed
    // from with confidence. Zero such people, or more than one, both mean
    // there's no way to tell from the numbers alone; see needsReview
    // above for why, and ImportBills.jsx for how those get resolved.
    const positivePayers = Object.entries(netByPerson).filter(([, net]) => net > 0.001)
    if (positivePayers.length !== 1) {
      needsReview.push({ date, description, category, cost, netByPerson })
      continue
    }
    const [payerName] = positivePayers[0]

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

    expenses.push({ date, description, category, cost, payerName, shares })
  }

  if (currenciesSeen.size > 1) {
    warnings.push(
      `This file mixes currencies (${[...currenciesSeen].join(', ')}) — every amount will be imported as a plain number, so double check nothing got mixed up.`
    )
  }

  return { peopleNames: peopleColumns.map((c) => c.name), expenses, needsReview, finalBalances, warnings }
}

// Compares what the app itself computes for each Splitwise name's balance,
// from the bills actually imported, against Splitwise's own trailing
// "Total balance" row (finalBalances, from parseSplitwiseCsv above) — a
// proof-check that the import (automatic rows plus whatever the review
// step resolved) reconstructs the same picture Splitwise itself had,
// before the export's own history stops mattering and the group moves
// forward inside this app instead.
//
// `bills`/`items`/`itemShares` are the same shapes computeBalances already
// expects (see settlement.js) — pass everything imported this run, not
// the group's full history, since finalBalances is itself only ever "as
// of the moment this CSV was exported," not "as of right now."
//
// `payments`, unlike those three, should be the group's *actual current*
// payments (defaulting to none, for a plain "just the bills" check) —
// Splitwise's own finalBalances has no notion of this app's local
// settle-up records at all, but the live Settle Up page always includes
// every one of them regardless of when they were recorded. Passing only
// this run's own inserts (or, worse, silently omitting real ones already
// on the group) would let this report "matches" and then visibly disagree
// with that page the moment you look at it — most confusingly right after
// deleting a group's bills without also clearing its payments and
// re-importing into the same, no-longer-quite-empty group.
// `nameToId` maps each Splitwise name to the group_members.id it was
// resolved to (the same mapping ImportBills.jsx builds while matching
// people), so a balance keyed by group_members.id can be compared against
// one keyed by Splitwise's own name.
//
// A tolerance of a few cents (rather than an exact match) absorbs
// rounding drift that can accumulate over hundreds of reconstructed
// shares — a couple of cents off across a thousand expenses isn't a sign
// of a broken import the way being off by whole euros would be.
export function checkImportBalances({ bills, items, itemShares, payments = [], finalBalances, nameToId }, tolerance = 0.05) {
  const balances = computeBalances({ bills, items, itemShares, payments })
  const rows = Object.entries(finalBalances).map(([name, expected]) => {
    const id = nameToId[name]
    const actual = id ? balances[id] || 0 : 0
    return {
      name,
      expected: Math.round(expected * 100) / 100,
      actual: Math.round(actual * 100) / 100,
      matches: Math.abs(expected - actual) <= tolerance,
    }
  })
  return { rows, allMatch: rows.every((r) => r.matches) }
}
