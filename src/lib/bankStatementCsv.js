import { parseCsv } from './csv'

// Unlike Splitwise's export (one fixed, known shape), a bank statement CSV
// varies wildly by bank and country — so this matches by a small set of
// common header aliases instead of one exact name, and accepts either a
// single signed "Amount" column or separate Debit/Credit columns,
// whichever the file actually has.
const DATE_ALIASES = ['date', 'transaction date', 'posting date', 'value date', 'booking date']
const DESC_ALIASES = ['description', 'payee', 'merchant', 'narrative', 'details', 'reference', 'memo', 'name']
const AMOUNT_ALIASES = ['amount', 'value']
const DEBIT_ALIASES = ['debit', 'withdrawal', 'money out', 'paid out', 'out']
const CREDIT_ALIASES = ['credit', 'deposit', 'money in', 'paid in', 'in']

function findColumn(lowerHeader, aliases) {
  for (const alias of aliases) {
    const idx = lowerHeader.indexOf(alias)
    if (idx !== -1) return idx
  }
  return -1
}

// Returns { transactions, warnings } — never throws. Each transaction is
// { date (ISO string), description, amount (always positive), direction:
// 'debit' | 'credit' } — the same shape parseBankStatementPdf's AI pass
// produces (see bank-statement-parsing/extractionPrompt.js), so
// ImportBankStatement.jsx handles both paths identically from here on.
export function parseBankStatementCsv(text) {
  const rows = parseCsv(text)
  if (rows.length < 2) {
    return { transactions: [], warnings: ['That file looks empty.'] }
  }

  const header = rows[0].map((h) => h.trim())
  const lower = header.map((h) => h.toLowerCase())
  const dataRows = rows.slice(1)

  const dateIdx = findColumn(lower, DATE_ALIASES)
  const descIdx = findColumn(lower, DESC_ALIASES)
  const amountIdx = findColumn(lower, AMOUNT_ALIASES)
  const debitIdx = findColumn(lower, DEBIT_ALIASES)
  const creditIdx = findColumn(lower, CREDIT_ALIASES)

  if (dateIdx === -1 || descIdx === -1 || (amountIdx === -1 && debitIdx === -1 && creditIdx === -1)) {
    return {
      transactions: [],
      warnings: [
        "This doesn't look like a bank statement export — couldn't find date, description, and amount columns. Try the PDF import instead, or check the file has a header row.",
      ],
    }
  }

  const warnings = []
  const transactions = []

  for (const row of dataRows) {
    const description = row[descIdx]?.trim()
    if (!description) continue

    const parsedDate = new Date(row[dateIdx])
    if (Number.isNaN(parsedDate.getTime())) {
      warnings.push(`Skipped "${description}" — couldn't read a valid date.`)
      continue
    }

    // A single signed column (the common shape for most modern banks/
    // fintechs) takes priority when present; separate debit/credit columns
    // are the fallback for banks that split them instead. Either way the
    // result is normalized to the same positive-amount-plus-direction
    // shape below.
    let amount
    if (amountIdx !== -1) {
      amount = Number(row[amountIdx])
    } else {
      const debit = debitIdx !== -1 && row[debitIdx] ? Number(row[debitIdx]) : 0
      const credit = creditIdx !== -1 && row[creditIdx] ? Number(row[creditIdx]) : 0
      amount = (Number.isFinite(credit) ? credit : 0) - (Number.isFinite(debit) ? debit : 0)
    }
    if (!Number.isFinite(amount) || amount === 0) {
      warnings.push(`Skipped "${description}" — couldn't read a valid amount.`)
      continue
    }

    transactions.push({
      date: parsedDate.toISOString(),
      description,
      amount: Math.abs(amount),
      direction: amount < 0 ? 'debit' : 'credit',
    })
  }

  if (transactions.length === 0 && warnings.length === 0) {
    warnings.push('No transaction rows found in that file.')
  }

  return { transactions, warnings }
}
