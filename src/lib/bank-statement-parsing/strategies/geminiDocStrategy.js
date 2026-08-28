import { getReceiptSettings } from '../../receiptSettings'
import { buildBankStatementPrompt, extractBankTransactions } from '../extractionPrompt'

const DEFAULT_MODEL = 'gemini-2.5-flash'

// Same account/key as receipt scanning (see receiptSettings.js). Gemini
// treats a PDF as just another inline_data blob (same field geminiStrategy.js
// uses for a photo, only the mime_type differs) — but kept as its own call
// anyway rather than parametrizing that one, same reasoning claudeDocStrategy.js
// gives: that strategy's prompt and response shape are built around a
// receipt's item list, this one's around a statement's transaction list.
async function callGemini(pdfBase64, apiKey, model) {
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
              { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
              { text: buildBankStatementPrompt() },
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
  return extractBankTransactions(raw)
}

export const geminiDocStrategy = {
  id: 'gemini',
  label: 'Google Gemini (your API key)',
  isConfigured: () => Boolean(getReceiptSettings().geminiApiKey),
  parse: (pdfBase64) => {
    const { geminiApiKey, geminiModel } = getReceiptSettings()
    if (!geminiApiKey) {
      throw new Error('No Gemini API key saved yet — add one in Scan settings.')
    }
    return callGemini(pdfBase64, geminiApiKey, geminiModel || DEFAULT_MODEL)
  },
}
