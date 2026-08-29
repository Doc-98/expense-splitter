import { parseCsv } from './csv'
import { parseTabularStatement } from './bankStatementTabular'

// Turns the CSV text into the same plain header-row-plus-data-rows 2D
// array Excel parsing produces, then hands it to the shared
// heuristic-plus-optional-AI-double-check pass in bankStatementTabular.js.
// Returns a Promise<{ transactions, warnings }> — never throws. Each
// transaction is { date (ISO string), description, amount (always
// positive), direction: 'debit' | 'credit' } — the same shape
// parseBankStatementPdf's AI pass produces (see
// bank-statement-parsing/extractionPrompt.js), so ImportBankStatement.jsx
// handles every input format identically from here on.
export async function parseBankStatementCsv(text) {
  const rows = parseCsv(text)
  return parseTabularStatement(rows)
}
