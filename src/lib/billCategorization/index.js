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
// losing every other batch's results — those titles just come back
// unresolved (null), same as a title the model itself wasn't confident
// about. `onProgress(done, total)` reports title counts, not batch
// counts, so it stays meaningful regardless of batch size.
export async function classifyTitles(titles, categoryNames, onProgress) {
  const strategy = resolveClassifyStrategy()
  if (!strategy) {
    throw new Error('No AI service configured — set one up in Scan settings first, or skip the AI pass entirely.')
  }

  const results = new Map() // title -> suggested category name | null
  let done = 0
  onProgress?.(done, titles.length)

  for (let start = 0; start < titles.length; start += CLASSIFY_BATCH_SIZE) {
    const batch = titles.slice(start, start + CLASSIFY_BATCH_SIZE)
    let batchResults
    try {
      batchResults = await strategy.classify(batch, categoryNames)
    } catch {
      // This batch's titles stay unresolved rather than aborting the
      // whole run — a transient failure on one chunk of a thousand-plus
      // bills shouldn't cost every other chunk's already-successful
      // suggestions.
      batchResults = new Array(batch.length).fill(null)
    }
    batch.forEach((title, i) => results.set(title, batchResults[i] ?? null))
    done += batch.length
    onProgress?.(done, titles.length)
  }

  return results
}
