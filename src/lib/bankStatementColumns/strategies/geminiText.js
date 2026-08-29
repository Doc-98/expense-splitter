import { getReceiptSettings } from '../../receiptSettings'
import { buildColumnPrompt, parseColumnResponse } from '../columnPrompt'

const DEFAULT_MODEL = 'gemini-2.5-flash'

// Same reasoning as claudeText.js in this directory — independent of every
// other geminiText/geminiDocStrategy call this app makes.
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
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1000 },
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

export const geminiColumnStrategy = {
  id: 'gemini',
  label: 'Google Gemini (your API key)',
  isConfigured: () => Boolean(getReceiptSettings().geminiApiKey),
  async detectColumns(header, sampleRows, heuristicColumns) {
    const { geminiApiKey, geminiModel } = getReceiptSettings()
    if (!geminiApiKey) throw new Error('No Gemini API key saved yet — add one in Scan settings.')
    const prompt = buildColumnPrompt(header, sampleRows, heuristicColumns)
    const raw = await callGeminiText(prompt, geminiApiKey, geminiModel || DEFAULT_MODEL)
    return parseColumnResponse(raw, header.length)
  },
}
