import { getReceiptSettings } from '../../receiptSettings'
import { buildExtractionPrompt, extractJsonItems } from '../extractionPrompt'
import { mediaKindFor, base64ToText } from '../mediaKind'
import { describeProviderError, describeNetworkError } from '../../aiProviderError'

const DEFAULT_MODEL = 'claude-sonnet-5'
const ANTHROPIC_VERSION = '2023-06-01'

// Claude attaches an image or a PDF the same way — a content block ahead
// of the prompt text, source.media_type carrying the actual file type.
// Plain text (or an HTML export) has no such attachment block of its own,
// so it's inlined directly into the prompt as prose instead.
function buildAttachmentBlock(imageBase64, mediaType, kind) {
  if (kind === 'text') {
    return { type: 'text', text: `Receipt text:\n\n${base64ToText(imageBase64)}` }
  }
  return {
    type: kind === 'document' ? 'document' : 'image',
    source: { type: 'base64', media_type: mediaType, data: imageBase64 },
  }
}

async function callClaude(imageBase64, mediaType, apiKey, model, categoryNames) {
  const kind = mediaKindFor(mediaType)
  let response
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
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
              buildAttachmentBlock(imageBase64, mediaType, kind),
              { type: 'text', text: buildExtractionPrompt(categoryNames, kind) },
            ],
          },
        ],
      }),
    })
  } catch {
    throw new Error(describeNetworkError('Claude'))
  }

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(describeProviderError('Claude', response.status, errText))
  }

  const data = await response.json()
  const textBlock = data.content?.find((block) => block.type === 'text')
  return extractJsonItems(textBlock?.text, categoryNames)
}

export const claudeStrategy = {
  id: 'claude',
  label: 'Anthropic Claude (your API key)',
  // See spatialStrategy.js for why these two exist alongside `label`.
  shortLabel: 'Anthropic Claude',
  badge: 'cloud',
  isConfigured: () => Boolean(getReceiptSettings().claudeApiKey),
  parse: (imageBase64, mediaType, onProgress, categoryNames = []) => {
    const { claudeApiKey, claudeModel } = getReceiptSettings()
    if (!claudeApiKey) {
      throw new Error('No Claude API key saved yet — add one in Scan settings.')
    }
    return callClaude(imageBase64, mediaType, claudeApiKey, claudeModel || DEFAULT_MODEL, categoryNames)
  },
}
