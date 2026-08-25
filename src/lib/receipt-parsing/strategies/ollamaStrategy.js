import { getReceiptSettings } from '../../receiptSettings'
import { buildExtractionPrompt, extractJsonItems } from '../extractionPrompt'

const DEFAULT_URL = 'http://localhost:11434'
const DEFAULT_MODEL = 'qwen2.5vl'

async function callOllama(imageBase64, mediaType, baseUrl, model, categoryNames) {
  let response
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: buildExtractionPrompt(categoryNames), images: [imageBase64] }],
        stream: false,
        format: 'json',
      }),
    })
  } catch {
    // Ollama blocks cross-origin browser requests by default — this is by
    // far the most likely failure mode, so it gets a specific, actionable
    // message rather than a generic "network error".
    throw new Error(
      `Could not reach Ollama at ${baseUrl}. Make sure it's running, and that ` +
        `OLLAMA_ORIGINS is set to allow this app's address — Ollama blocks browser ` +
        `requests from other origins by default. See Scan settings for details.`
    )
  }

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Ollama error (${response.status}): ${errText}`)
  }

  const data = await response.json()
  return extractJsonItems(data.message?.content, categoryNames)
}

export const ollamaStrategy = {
  id: 'ollama',
  label: 'Local Ollama (private, runs on your network)',
  // Always "configured" — sensible defaults exist for both fields, nothing
  // strictly required before trying it, unlike the BYOK cloud strategies.
  isConfigured: () => true,
  parse: (imageBase64, mediaType, onProgress, categoryNames = []) => {
    const { ollamaUrl, ollamaModel } = getReceiptSettings()
    return callOllama(imageBase64, mediaType, ollamaUrl || DEFAULT_URL, ollamaModel || DEFAULT_MODEL, categoryNames)
  },
}
