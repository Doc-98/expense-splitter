import { getReceiptSettings } from '../../receiptSettings'
import { EXTRACTION_PROMPT, extractJsonItems } from '../extractionPrompt'

const DEFAULT_MODEL = 'gemini-2.5-flash'

async function callGemini(imageBase64, mediaType, apiKey, model) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: mediaType, data: imageBase64 } },
              { text: EXTRACTION_PROMPT },
            ],
          },
        ],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  )

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Gemini API error (${response.status}): ${errText}`)
  }

  const data = await response.json()
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text
  return extractJsonItems(raw)
}

export const geminiStrategy = {
  id: 'gemini',
  label: 'Google Gemini (your API key)',
  isConfigured: () => Boolean(getReceiptSettings().geminiApiKey),
  parse: (imageBase64, mediaType) => {
    const { geminiApiKey, geminiModel } = getReceiptSettings()
    if (!geminiApiKey) {
      throw new Error('No Gemini API key saved yet — add one in Scan settings.')
    }
    return callGemini(imageBase64, mediaType, geminiApiKey, geminiModel || DEFAULT_MODEL)
  },
}
