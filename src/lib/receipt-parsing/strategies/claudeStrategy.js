import { getReceiptSettings } from '../../receiptSettings'
import { buildExtractionPrompt, extractJsonItems } from '../extractionPrompt'

const DEFAULT_MODEL = 'claude-sonnet-5'
const ANTHROPIC_VERSION = '2023-06-01'

async function callClaude(imageBase64, mediaType, apiKey, model, categoryNames) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      // Anthropic's explicit opt-in for calling their API directly from a
      // browser — without this, the request is rejected before it even
      // reaches the model. Fine here specifically because it's the user's
      // own key, entered by them, used only from their own browser — not a
      // shared secret serving every visitor of a deployed app.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: buildExtractionPrompt(categoryNames) },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Claude API error (${response.status}): ${errText}`)
  }

  const data = await response.json()
  const textBlock = data.content?.find((block) => block.type === 'text')
  return extractJsonItems(textBlock?.text, categoryNames)
}

export const claudeStrategy = {
  id: 'claude',
  label: 'Anthropic Claude (your API key)',
  isConfigured: () => Boolean(getReceiptSettings().claudeApiKey),
  parse: (imageBase64, mediaType, onProgress, categoryNames = []) => {
    const { claudeApiKey, claudeModel } = getReceiptSettings()
    if (!claudeApiKey) {
      throw new Error('No Claude API key saved yet — add one in Scan settings.')
    }
    return callClaude(imageBase64, mediaType, claudeApiKey, claudeModel || DEFAULT_MODEL, categoryNames)
  },
}
