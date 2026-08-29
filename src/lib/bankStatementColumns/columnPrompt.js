import { parseJsonResponse } from '../parseJsonResponse'

// Builds the prompt for one AI double-check pass over a CSV/Excel
// statement's column layout — kept separate from the per-provider strategy
// files (see strategies/) for the same reason classifyPrompt.js is: so the
// three providers don't drift out of sync on what's actually being asked.
//
// Asks for column *indices*, never for the model to re-type or summarize
// any cell value itself — the same reasoning buildClassifyPrompt uses for
// titles. This keeps the actual dates/amounts entirely in this app's own
// hands (parseMoneyAmount, Date parsing in bankStatementRows.js); the model
// only ever points at which column holds which kind of value, so it has
// nothing to hallucinate a number into.
export function buildColumnPrompt(header, sampleRows, heuristicColumns) {
  const headerList = header.map((h, i) => `${i}. ${JSON.stringify(h)}`).join('\n')
  const sampleText = sampleRows.map((row) => row.map((cell) => JSON.stringify(cell ?? '')).join(' | ')).join('\n')

  return `You are double-checking column detection for a bank or credit-card statement export (CSV or Excel) being imported into an expense-tracking app. A simple automatic pass already tried to match column headers against a list of common aliases; your job is to confirm it or correct it by actually looking at the sample values, since a header can be worded in a way that alias list doesn't cover (a different language, an unusual bank's own wording, or a header that's missing/misleading).

Columns, numbered 0-based exactly as below:
${headerList}

A few sample data rows, cells in the same left-to-right column order as above, separated by " | ":
${sampleText}

The automatic pass guessed (or -1 meaning it found nothing): date column=${heuristicColumns.dateIdx}, description column=${heuristicColumns.descIdx}, single signed amount column=${heuristicColumns.amountIdx}, separate debit column=${heuristicColumns.debitIdx}, separate credit column=${heuristicColumns.creditIdx}.

A real statement has a date column, a description/payee/merchant column, and EITHER one signed amount column OR a separate debit and credit column pair — never both an amount column and a debit/credit pair populated at once. Decide which pattern this file actually uses from the sample values themselves (a date column has date-shaped values; a money column has money-shaped values), not just the header wording. If this doesn't look like a bank statement at all — no plausible date, description, and amount/debit/credit columns among the samples — return every field null.

Return ONLY a JSON object, no other text, no markdown fences, in exactly this shape:
{"dateColumn": number or null, "descriptionColumn": number or null, "amountColumn": number or null, "debitColumn": number or null, "creditColumn": number or null}`
}

// Tolerant of a missing/malformed response, an out-of-range index, or an
// internally inconsistent answer (e.g. both amountColumn and debitColumn
// set) — any of those just means the AI opinion is discarded and the
// heuristic's own result stands, same "a failed AI pass changes nothing"
// principle used everywhere else AI is optional in this app.
export function parseColumnResponse(rawText, columnCount) {
  let parsed
  try {
    parsed = parseJsonResponse(rawText)
  } catch {
    return null
  }

  function readIndex(value) {
    if (value === null || value === undefined) return -1
    const n = Number(value)
    if (!Number.isInteger(n) || n < 0 || n >= columnCount) return null // out of range — untrustworthy
    return n
  }

  const dateIdx = readIndex(parsed.dateColumn)
  const descIdx = readIndex(parsed.descriptionColumn)
  const amountIdx = readIndex(parsed.amountColumn)
  const debitIdx = readIndex(parsed.debitColumn)
  const creditIdx = readIndex(parsed.creditColumn)
  if ([dateIdx, descIdx, amountIdx, debitIdx, creditIdx].some((v) => v === null)) return null

  // Both an amount column and a debit/credit pair claimed at once is
  // internally inconsistent — a real statement uses one shape or the
  // other, so this reads as the model not actually being sure, not as a
  // richer answer to trust.
  if (amountIdx !== -1 && (debitIdx !== -1 || creditIdx !== -1)) return null

  return { dateIdx, descIdx, amountIdx, debitIdx, creditIdx }
}
