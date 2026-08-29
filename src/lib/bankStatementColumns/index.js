import { claudeColumnStrategy } from './strategies/claudeText'
import { geminiColumnStrategy } from './strategies/geminiText'
import { ollamaColumnStrategy } from './strategies/ollamaText'
import { getReceiptSettings } from '../receiptSettings'

// A plain text prompt, so — unlike bank-statement-parsing/ (PDF, vision/
// document only) — Ollama's own model is just as usable here as Claude's
// or Gemini's, same as billCategorization/'s three strategies.
export const COLUMN_DETECTION_STRATEGIES = [claudeColumnStrategy, geminiColumnStrategy, ollamaColumnStrategy]

function resolveStrategy() {
  const { strategyId } = getReceiptSettings()
  return COLUMN_DETECTION_STRATEGIES.find((s) => s.id === strategyId && s.isConfigured()) || null
}

export function isColumnDetectionConfigured() {
  return resolveStrategy() !== null
}

// Returns the AI's own column mapping — { dateIdx, descIdx, amountIdx,
// debitIdx, creditIdx } — or null when no AI is configured, or when the
// call fails or comes back unusable for any reason. Never throws: this is
// always a *double-check* layered on top of bankStatementRows.js's own
// heuristic, which already works standalone — a null here just means the
// heuristic's own result stands unchallenged, exactly as if this whole
// module didn't exist.
export async function detectColumnsWithAI(header, sampleRows, heuristicColumns) {
  const strategy = resolveStrategy()
  if (!strategy) return null
  try {
    return await strategy.detectColumns(header, sampleRows, heuristicColumns)
  } catch {
    return null
  }
}
