import { getReceiptSettings } from '../../receiptSettings'
import { buildClassifyPrompt, parseClassifyResponse } from '../classifyPrompt'

const DEFAULT_URL = 'http://localhost:11434'
const DEFAULT_MODEL = 'qwen2.5vl'

// Same reasoning as claudeText.js/geminiText.js — independent of
// ollamaStrategy.js's own callOllama(), which always sends an image.
async function callOllamaText(prompt, baseUrl, model) {
  let response
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        format: 'json',
      }),
    })
  } catch {
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
  return data.message?.content
}

export const ollamaTextStrategy = {
  id: 'ollama',
  label: 'Local Ollama (private, runs on your network)',
  // Same trade-off as ollamaStrategy.js: the model configured for
  // (vision) receipt scanning is used here too, even though a
  // classification prompt is plain text and would work with a
  // non-vision model as well — asking for a second, separate model
  // choice just for this one occasional wizard wasn't worth the extra
  // Scan settings field.
  isConfigured: () => true,
  async classify(titles, categoryNames, extraContext) {
    const { ollamaUrl, ollamaModel } = getReceiptSettings()
    const prompt = buildClassifyPrompt(categoryNames, titles, extraContext)
    const raw = await callOllamaText(prompt, ollamaUrl || DEFAULT_URL, ollamaModel || DEFAULT_MODEL)
    return parseClassifyResponse(raw, titles, categoryNames)
  },
}
