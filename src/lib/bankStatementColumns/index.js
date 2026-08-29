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

// Whether an AI service is set up at all that *could* run this — used to
// decide whether ImportBankStatement.jsx's own opt-out checkbox is worth
// showing (no strategy configured means there's nothing to opt out of).
export function isColumnDetectionAvailable() {
  return resolveStrategy() !== null
}

// isColumnDetectionAvailable() plus the person hasn't turned this specific
// check off in Scan settings — unlike the PDF import path, which needs AI
// by design, CSV/Excel's own heuristic (bankStatementRows.js) already
// works standalone, so this one AI use is opt-outable independently of
// whichever service is configured for everything else.
export function isColumnDetectionEnabled() {
  return isColumnDetectionAvailable() && getReceiptSettings().bankStatementAiColumnCheck !== false
}

// Returns the AI's own column mapping — { dateIdx, descIdx, amountIdx,
// debitIdx, creditIdx } — or null when no AI is configured, the check is
// turned off, or the call fails or comes back unusable for any reason.
// Never throws: this is always a *double-check* layered on top of
// bankStatementRows.js's own heuristic, which already works standalone —
// a null here just means the heuristic's own result stands unchallenged,
// exactly as if this whole module didn't exist.
export async function detectColumnsWithAI(header, sampleRows, heuristicColumns) {
  if (!isColumnDetectionEnabled()) return null
  const strategy = resolveStrategy()
  try {
    return await strategy.detectColumns(header, sampleRows, heuristicColumns)
  } catch {
    return null
  }
}
