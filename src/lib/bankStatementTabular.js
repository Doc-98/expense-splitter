import {
  cellToString,
  detectColumns,
  isUsableColumnMapping,
  buildTransactionsFromColumns,
  findHeaderRowIndex,
} from './bankStatementRows'
import { detectColumnsWithAI } from './bankStatementColumns'

// How many data rows get shown to the AI double-check — enough for it to
// actually recognize a date-shaped or money-shaped column from real
// values, small enough to keep the prompt (and, by extension, how much of
// someone's own transaction history leaves their device) to a handful of
// rows rather than the whole statement.
const SAMPLE_ROW_COUNT = 8

function columnsMatch(a, b) {
  return a.dateIdx === b.dateIdx && a.descIdx === b.descIdx && a.amountIdx === b.amountIdx &&
    a.debitIdx === b.debitIdx && a.creditIdx === b.creditIdx
}

// The shared entry point parseBankStatementCsv.js and bankStatementXlsx.js
// both call once they've turned their own file format into a plain 2D
// array. Runs bankStatementRows.js's free heuristic first — that alone is
// enough to import a CSV/Excel statement with zero setup, same as before
// Excel support or AI double-checking existed — then, only if an AI
// service is configured in Scan settings, asks it to independently look at
// the header and a few sample rows and propose its own column mapping.
//
// The AI opinion is trusted over the heuristic's only when the two
// disagree on a *usable* mapping the AI came back with — the heuristic's
// exact-alias match is otherwise the more predictable of the two, so
// there's no reason to prefer a "confirms the same answer" AI call over
// just not asking. When they do disagree, this app's own house rule for
// any AI suggestion applies: flag it, never apply it silently — a warning
// is added asking the person to double-check the dates and amounts on the
// review screen before importing, rather than either trusting the AI
// blindly or discarding its (possibly correct) correction.
export async function parseTabularStatement(rows) {
  if (!rows || rows.length < 2) {
    return { transactions: [], warnings: ['That file looks empty.'] }
  }

  // Some exports (Excel ones especially) lead with a block of report
  // metadata before the actual column-title row — see
  // findHeaderRowIndex's own comment in bankStatementRows.js. Scanning for
  // it here, once, up front means both the heuristic below and the AI
  // double-check get the *real* header and real sample rows, instead of
  // the AI dutifully double-checking a mapping built from someone's
  // account summary.
  const headerIdx = findHeaderRowIndex(rows)
  const headerRow = headerIdx === -1 ? 0 : headerIdx
  const header = rows[headerRow].map(cellToString)
  const dataRows = rows.slice(headerRow + 1)
  const heuristicColumns = detectColumns(header)
  const heuristicUsable = isUsableColumnMapping(heuristicColumns)

  const aiColumns = await detectColumnsWithAI(header, dataRows.slice(0, SAMPLE_ROW_COUNT), heuristicColumns)

  let columns = heuristicColumns
  const notices = []
  if (aiColumns && isUsableColumnMapping(aiColumns) && !columnsMatch(heuristicColumns, aiColumns)) {
    // The AI column-check only ever proposes date/description/amount/
    // debit/credit — categoryIdx is carried over from the heuristic's own
    // mapping regardless, since a category column is this app's own
    // concept (see bankStatementRows.js's CATEGORY_ALIASES), not
    // something the AI double-check was ever asked to look for.
    columns = { ...aiColumns, categoryIdx: heuristicColumns.categoryIdx }
    if (heuristicUsable) {
      notices.push(
        "AI review found a different column layout than the automatic match — double-check the dates and amounts below before importing."
      )
    }
  }

  if (!isUsableColumnMapping(columns)) {
    return {
      transactions: [],
      warnings: [
        "This doesn't look like a bank statement export — couldn't find date, description, and amount columns. Try the PDF import instead, or check the file has a header row.",
      ],
    }
  }

  const { transactions, warnings } = buildTransactionsFromColumns(dataRows, columns)
  return { transactions, warnings: [...notices, ...warnings] }
}
