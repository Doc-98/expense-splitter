import { geminiStrategy } from './strategies/geminiStrategy'
import { claudeStrategy } from './strategies/claudeStrategy'
import { ollamaStrategy } from './strategies/ollamaStrategy'
import { spatialStrategy } from './strategies/spatialStrategy'
import { getReceiptSettings } from '../receiptSettings'

// Ordered roughly by "requires the most setup" first. spatialStrategy is
// always last and always configured — it's the guaranteed fallback, so a
// scan never just fails outright even if nothing else is set up.
export const STRATEGIES = [geminiStrategy, claudeStrategy, ollamaStrategy, spatialStrategy]

function resolveStrategy() {
  const { strategyId } = getReceiptSettings()
  return STRATEGIES.find((s) => s.id === strategyId && s.isConfigured()) || spatialStrategy
}

// `categoryNames` is optional — a group with no categories yet (or a
// caller with no group context, like the sample-receipt demo) just gets
// plain item extraction, same as before this existed.
export async function parseReceipt(imageBase64, mediaType, onProgress, categoryNames = []) {
  const strategy = resolveStrategy()
  const items = await strategy.parse(imageBase64, mediaType, onProgress, categoryNames)
  return { items, strategyLabel: strategy.label }
}

export function currentStrategyLabel() {
  return resolveStrategy().label
}
