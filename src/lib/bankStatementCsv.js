import { parseCsv } from './csv'
import { buildTransactionsFromRows } from './bankStatementRows'

// Thin wrapper: turn the CSV text into the same plain header-row-plus-
// data-rows 2D array Excel parsing produces, then hand it to the shared
// column-detection-plus-transaction-building pass in bankStatementRows.js.
// Returns { transactions, warnings } — never throws. Each transaction is
// { date (ISO string), description, amount (always positive), direction:
// 'debit' | 'credit' } — the same shape parseBankStatementPdf's AI pass
// produces (see bank-statement-parsing/extractionPrompt.js), so
// ImportBankStatement.jsx handles every input format identically from here
// on.
export function parseBankStatementCsv(text) {
  const rows = parseCsv(text)
  return buildTransactionsFromRows(rows)
}
