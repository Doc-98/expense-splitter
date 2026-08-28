import { claudeDocStrategy } from './strategies/claudeDocStrategy'
import { geminiDocStrategy } from './strategies/geminiDocStrategy'
import { getReceiptSettings } from '../receiptSettings'

// No Ollama, and no zero-config fallback the way spatialStrategy is for
// receipts: a local vision model served through Ollama's own API doesn't
// reliably take a multi-page PDF document the way Claude's and Gemini's
// hosted APIs do (it's built for single images), and there's no offline
// heuristic — the way spatialStrategy's pixel-position parsing is for a
// photographed receipt — that could plausibly read a real bank statement's
// layout. Whoever hasn't configured Claude or Gemini simply can't use the
// PDF path; ImportBankStatement.jsx surfaces that plainly and points at the
// CSV path instead, which needs no AI at all.
export const BANK_STATEMENT_STRATEGIES = [claudeDocStrategy, geminiDocStrategy]

function resolveStrategy() {
  const { strategyId } = getReceiptSettings()
  return BANK_STATEMENT_STRATEGIES.find((s) => s.id === strategyId && s.isConfigured()) || null
}

export function isBankStatementPdfConfigured() {
  return resolveStrategy() !== null
}

export function currentBankStatementStrategyLabel() {
  return resolveStrategy()?.label || null
}

export async function parseBankStatementPdf(pdfBase64) {
  const strategy = resolveStrategy()
  if (!strategy) {
    throw new Error(
      'No AI service configured for reading PDF statements — set up Claude or Gemini in Scan settings, or use a CSV export from your bank instead.'
    )
  }
  return strategy.parse(pdfBase64)
}
