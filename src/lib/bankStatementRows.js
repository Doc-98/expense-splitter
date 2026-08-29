// Shared by every input format — parseBankStatementCsv.js and
// bankStatementXlsx.js each turn their own file format into the same
// plain "header row + data rows" 2D array (cells possibly strings,
// numbers, or Date objects, depending on the format) and hand it to this
// one column-detection-plus-transaction-building pass, so CSV and Excel
// don't drift into two different ideas of which column aliases are
// recognized or how an amount gets parsed.
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

// Excel hands back real Date/number values for a properly-typed cell;
// CSV is always plain strings. Normalizes either into a trimmed string —
// used for the header row and the description column, neither of which
// should ever *need* to be anything but text, but a stray numeric or
// date-typed cell there (a mis-mapped column, an odd export) shouldn't
// throw, just read a bit strangely.
function cellToString(cell) {
  if (cell == null) return ''
  if (cell instanceof Date) return cell.toISOString()
  return String(cell).trim()
}

// Bank exports vary far more than a typed price ever does: currency
// symbols ("$42.10", "€ 1.234,56"), thousands separators, parenthesized
// negatives ("(42.10)", common accounting notation for a debit), or an
// Excel cell that's already a genuine JS number and needs none of this at
// all. Non-numeric characters are stripped first (keeping only digits,
// comma, and period), then — only when *both* a comma and a period
// appear — whichever comes last is treated as the real decimal separator
// and the other discarded as a thousands separator, matching how
// virtually every locale actually writes money: "1,234.56" US-style vs
// "1.234,56" EU-style. With only one of the two present, falls back to
// the same "a lone comma is probably someone's decimal point" rule
// parseNumber() uses for a hand-typed amount elsewhere in this app.
export function parseMoneyAmount(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN
  if (raw == null) return NaN

  const original = String(raw).trim()
  if (!original) return NaN
  const negative = /^-/.test(original) || /^\(.*\)$/.test(original)

  let s = original.replace(/[^0-9.,]/g, '')
  if (!s) return NaN

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma !== -1 && lastDot !== -1) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma !== -1) {
    s = s.replace(',', '.')
  }

  const value = Number(s)
  if (!Number.isFinite(value)) return NaN
  return negative ? -Math.abs(value) : value
}

// A dedicated Debit or Credit column already carries its own direction —
// whatever sign (if any) is literally written in the cell shouldn't be
// allowed to flip that, so this always returns a non-negative magnitude.
function parseColumnMagnitude(cell) {
  if (cell == null || cell === '') return 0
  const value = parseMoneyAmount(cell)
  return Number.isFinite(value) ? Math.abs(value) : NaN
}

// Returns { transactions, warnings } — never throws. Each transaction is
// { date (ISO string), description, amount (always positive), direction:
// 'debit' | 'credit' } — the same shape the PDF/AI path produces (see
// bank-statement-parsing/extractionPrompt.js), so ImportBankStatement.jsx
// handles every input format identically from here on.
export function buildTransactionsFromRows(rows) {
  if (!rows || rows.length < 2) {
    return { transactions: [], warnings: ['That file looks empty.'] }
  }

  const header = rows[0].map(cellToString)
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
    const description = cellToString(row[descIdx])
    if (!description) continue

    const dateCell = row[dateIdx]
    const parsedDate = dateCell instanceof Date ? dateCell : new Date(dateCell)
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
      amount = parseMoneyAmount(row[amountIdx])
    } else {
      const debit = debitIdx !== -1 ? parseColumnMagnitude(row[debitIdx]) : 0
      const credit = creditIdx !== -1 ? parseColumnMagnitude(row[creditIdx]) : 0
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
