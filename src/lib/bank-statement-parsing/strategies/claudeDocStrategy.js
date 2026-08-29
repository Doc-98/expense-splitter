import { getReceiptSettings } from '../../receiptSettings'
import { buildBankStatementPrompt, extractBankTransactions } from '../extractionPrompt'

const DEFAULT_MODEL = 'claude-sonnet-5'
const ANTHROPIC_VERSION = '2023-06-01'

// Same account/key as receipt scanning and bill-categorization (see
// receiptSettings.js) — a second use for the one already-entered key, not
// a second thing to configure. Deliberately its own fetch call rather than
// reshaping claudeStrategy.js's callClaude(): that one's request body is
// built around always sending an image; this always sends a PDF document
// block instead. Same reasoning claudeText.js already gives for not
// sharing with it either.
async function callClaude(pdfBase64, apiKey, model) {
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
      // A full statement's worth of transactions is a much longer JSON
      // response than a receipt's handful of items — 2000 (what receipt
      // scanning uses) would truncate a busy month partway through. Even
      // 8000 turned out tight for a genuinely busy statement (a full
      // month of daily-card-use transactions can run well past that many
      // tokens of JSON), so this is set with real headroom rather than
      // just past the common case.
      max_tokens: 16000,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            { type: 'text', text: buildBankStatementPrompt() },
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
  return extractBankTransactions(textBlock?.text)
}

export const claudeDocStrategy = {
  id: 'claude',
  label: 'Anthropic Claude (your API key)',
  isConfigured: () => Boolean(getReceiptSettings().claudeApiKey),
  parse: (pdfBase64) => {
    const { claudeApiKey, claudeModel } = getReceiptSettings()
    if (!claudeApiKey) {
      throw new Error('No Claude API key saved yet — add one in Scan settings.')
    }
    return callClaude(pdfBase64, claudeApiKey, claudeModel || DEFAULT_MODEL)
  },
}
