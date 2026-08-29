import { buildTransactionsFromRows } from './bankStatementRows'

// Dynamically imported, same convention as Tesseract.js elsewhere in this
// app — a library only the Excel-import path needs shouldn't bloat every
// other page's bundle. read-excel-file (not the far more popular `xlsx`/
// SheetJS package) specifically because it has zero known vulnerabilities;
// `xlsx` carries unpatched prototype-pollution and ReDoS CVEs with "No fix
// available" on the npm registry, and SheetJS's own patched build is only
// distributed from a host this environment's egress policy blocks anyway.
//
// Returns { transactions, warnings } — never throws; a corrupt or
// unreadable file surfaces as a warning-only result the same way an
// unrecognized CSV shape does, so ImportBankStatement.jsx doesn't need a
// separate error path per format.
export async function parseBankStatementXlsx(file) {
  const { default: readXlsxFile } = await import('read-excel-file/browser')
  let rows
  try {
    rows = await readXlsxFile(file)
  } catch (err) {
    return { transactions: [], warnings: [`Couldn't read that Excel file: ${err.message}`] }
  }
  return buildTransactionsFromRows(rows)
}
