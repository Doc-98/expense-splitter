// Every model call this app makes (receipt extraction, bill-title
// categorization) asks for a bare JSON object back, but models
// occasionally wrap it in a markdown code fence anyway — this strips that
// defensively before JSON.parse, rather than trusting each provider's
// instruction-following. Shared by src/lib/receipt-parsing/extractionPrompt.js
// and src/lib/billCategorization/classifyPrompt.js so the two don't
// quietly drift out of sync on this one shared concern.
export function parseJsonResponse(rawText) {
  const cleaned = (rawText || '{}').trim().replace(/^```json\s*|^```\s*|```$/g, '')
  try {
    return JSON.parse(cleaned)
  } catch {
    throw new Error("Could not parse the model's response as JSON")
  }
}
