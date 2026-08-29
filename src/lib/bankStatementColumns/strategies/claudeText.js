import { getReceiptSettings } from '../../receiptSettings'
import { buildColumnPrompt, parseColumnResponse } from '../columnPrompt'

const DEFAULT_MODEL = 'claude-sonnet-5'
const ANTHROPIC_VERSION = '2023-06-01'

// Independent of claudeText.js in billCategorization/ and of
// claudeDocStrategy.js in bank-statement-parsing/ — same convention as
// both of those: a small, self-contained call for its own content shape
// (a plain text prompt, no image or document) rather than reshaping a
// strategy another feature already depends on.
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
      max_tokens: 1000,
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

export const claudeColumnStrategy = {
  id: 'claude',
  label: 'Anthropic Claude (your API key)',
  isConfigured: () => Boolean(getReceiptSettings().claudeApiKey),
  async detectColumns(header, sampleRows, heuristicColumns) {
    const { claudeApiKey, claudeModel } = getReceiptSettings()
    if (!claudeApiKey) throw new Error('No Claude API key saved yet — add one in Scan settings.')
    const prompt = buildColumnPrompt(header, sampleRows, heuristicColumns)
    const raw = await callClaudeText(prompt, claudeApiKey, claudeModel || DEFAULT_MODEL)
    return parseColumnResponse(raw, header.length)
  },
}
