import { getReceiptSettings } from '../../receiptSettings'
import { buildColumnPrompt, parseColumnResponse } from '../columnPrompt'

const DEFAULT_URL = 'http://localhost:11434'
const DEFAULT_MODEL = 'qwen2.5vl'

// Same reasoning as claudeText.js/geminiText.js in this directory.
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

export const ollamaColumnStrategy = {
  id: 'ollama',
  label: 'Local Ollama (private, runs on your network)',
  // Same trade-off as ollamaText.js in billCategorization/: the model
  // configured for (vision) receipt scanning is reused here too, even
  // though this prompt is plain text.
  isConfigured: () => true,
  async detectColumns(header, sampleRows, heuristicColumns) {
    const { ollamaUrl, ollamaModel } = getReceiptSettings()
    const prompt = buildColumnPrompt(header, sampleRows, heuristicColumns)
    const raw = await callOllamaText(prompt, ollamaUrl || DEFAULT_URL, ollamaModel || DEFAULT_MODEL)
    return parseColumnResponse(raw, header.length)
  },
}
