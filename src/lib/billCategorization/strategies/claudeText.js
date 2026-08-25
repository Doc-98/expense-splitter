import { getReceiptSettings } from '../../receiptSettings'
import { buildClassifyPrompt, parseClassifyResponse } from '../classifyPrompt'

const DEFAULT_MODEL = 'claude-sonnet-5'
const ANTHROPIC_VERSION = '2023-06-01'

// Same account/key as receipt scanning (see receiptSettings.js) — this
// isn't a second thing to configure, just a second use for the one
// already-entered key. Deliberately not sharing the actual fetch call
// with claudeStrategy.js's callClaude(): that function's request body is
// built around always sending an image, and this one never does — kept as
// its own small, independent call instead of reshaping a strategy real
// receipt scans already depend on.
async function callClaudeText(prompt, apiKey, model) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Claude API error (${response.status}): ${errText}`)
  }

  const data = await response.json()
  const textBlock = data.content?.find((block) => block.type === 'text')
  return textBlock?.text
}

export const claudeTextStrategy = {
  id: 'claude',
  label: 'Anthropic Claude (your API key)',
  isConfigured: () => Boolean(getReceiptSettings().claudeApiKey),
  async classify(titles, categoryNames, extraContext) {
    const { claudeApiKey, claudeModel } = getReceiptSettings()
    if (!claudeApiKey) throw new Error('No Claude API key saved yet — add one in Scan settings.')
    const prompt = buildClassifyPrompt(categoryNames, titles, extraContext)
    const raw = await callClaudeText(prompt, claudeApiKey, claudeModel || DEFAULT_MODEL)
    return parseClassifyResponse(raw, titles, categoryNames)
  },
}
