import { claudeTextStrategy } from './strategies/claudeText'
import { geminiTextStrategy } from './strategies/geminiText'
import { ollamaTextStrategy } from './strategies/ollamaText'
import { getReceiptSettings } from '../receiptSettings'

// No text-classification equivalent of the "Free OCR" strategy — the
// spatial/Tesseract fallback only reads pixels off a receipt photo, it
// has no language model behind it at all, so it has nothing to offer a
// "guess a category from this title" task. Whoever hasn't configured one
// of the other three simply can't run the AI pass — see
// CategorizeBills.jsx for how that's surfaced (the free, non-AI pass
// still works regardless).
export const CLASSIFY_STRATEGIES = [claudeTextStrategy, geminiTextStrategy, ollamaTextStrategy]

export function resolveClassifyStrategy() {
  const { strategyId } = getReceiptSettings()
  return CLASSIFY_STRATEGIES.find((s) => s.id === strategyId && s.isConfigured()) || null
}

// Titles per model call — large enough that a group's whole set of
// distinct uncategorized titles usually fits in one or two calls, small
// enough to stay well clear of any provider's output-length limits (each
// result is short: an index and a short category name) and to keep a
// single failed call from losing more than a few hundred titles' worth of
// suggestions. Exported for the pure planning logic to size progress
// reporting against, and for tests.
export const CLASSIFY_BATCH_SIZE = 150

// Runs every batch through whichever strategy is configured, tolerant of
// one batch failing outright (network error, malformed response) without
// losing every other batch's results. `onBatch(batch, batchResults)` gets
// each batch's answers (a category name or null per entry), or null in
// place of the answers when that batch failed. `onProgress(done, total)`
// reports entry counts, not batch counts, so it stays meaningful
// regardless of batch size.
async function runBatches(entries, categoryNames, onProgress, extraContext, onBatch) {
  const strategy = resolveClassifyStrategy()
  if (!strategy) {
    throw new Error('No AI service configured — set one up in Scan settings first, or skip the AI pass entirely.')
  }

  let done = 0
  onProgress?.(done, entries.length)

  for (let start = 0; start < entries.length; start += CLASSIFY_BATCH_SIZE) {
    const batch = entries.slice(start, start + CLASSIFY_BATCH_SIZE)
    let batchResults
    try {
      batchResults = await strategy.classify(batch, categoryNames, extraContext)
    } catch {
      batchResults = null
    }
    onBatch(batch, batchResults)
    done += batch.length
    onProgress?.(done, entries.length)
  }
}

// Plain titles (CategorizeBills.jsx): title -> suggested category name, or
// null. A failed batch's titles stay unresolved (null) rather than aborting
// the whole run, same as a title the model itself wasn't confident about —
// a transient failure on one chunk of a thousand-plus bills shouldn't cost
// every other chunk's already-successful suggestions.
export async function classifyTitles(titles, categoryNames, onProgress, extraContext) {
  const results = new Map()
  await runBatches(titles, categoryNames, onProgress, extraContext, (batch, batchResults) => {
    batch.forEach((title, i) => results.set(title, batchResults?.[i] ?? null))
  })
  return results
}

// A stable key for one bank-statement entry (see classifierEntry() in
// bankStatementEvidence.js): two transactions with the same title, details
// and bank category are one question, asked once.
export function classifyEntryKey(entry) {
  return JSON.stringify([entry.title, entry.details, entry.bankCategory, entry.bankCategoryMappedTo])
}

// Bank-statement entries (ImportBankStatement.jsx): classifyEntryKey(entry)
// -> suggested category name, or null when the model looked and declined
// to guess. Unlike classifyTitles, an entry whose batch failed is left out
// of the map altogether: "no answer" and "answered: can't tell" lead to
// different things there (a bank-derived default is kept in the first
// case and dropped in the second).
export async function classifyEntries(entries, categoryNames, onProgress, extraContext) {
  const unique = [...new Map(entries.map((entry) => [classifyEntryKey(entry), entry])).values()]
  const results = new Map()
  await runBatches(unique, categoryNames, onProgress, extraContext, (batch, batchResults) => {
    if (!batchResults) return
    batch.forEach((entry, i) => results.set(classifyEntryKey(entry), batchResults[i] ?? null))
  })
  return results
}
