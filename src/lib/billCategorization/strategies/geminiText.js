import { getReceiptSettings } from '../../receiptSettings'
import { buildClassifyPrompt, parseClassifyResponse } from '../classifyPrompt'

const DEFAULT_MODEL = 'gemini-2.5-flash'

// Same reasoning as claudeText.js: independent of geminiStrategy.js's own
// callGemini(), which always sends an image — this one never does.
async function callGeminiText(prompt, apiKey, model) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  )

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Gemini API error (${response.status}): ${errText}`)
  }

  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text
}

export const geminiTextStrategy = {
  id: 'gemini',
  label: 'Google Gemini (your API key)',
  isConfigured: () => Boolean(getReceiptSettings().geminiApiKey),
  async classify(titles, categoryNames) {
    const { geminiApiKey, geminiModel } = getReceiptSettings()
    if (!geminiApiKey) throw new Error('No Gemini API key saved yet — add one in Scan settings.')
    const prompt = buildClassifyPrompt(categoryNames, titles)
    const raw = await callGeminiText(prompt, geminiApiKey, geminiModel || DEFAULT_MODEL)
    return parseClassifyResponse(raw, titles, categoryNames)
  },
}
