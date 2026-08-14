// Shared by every cloud/local vision-model strategy (Gemini, Claude, Ollama)
// — kept in one place so the three don't quietly drift out of sync.
export const EXTRACTION_PROMPT = `You are reading a photo of a shopping/grocery receipt. Extract every purchased line item.

Return ONLY a JSON object, no other text, no markdown fences, in exactly this shape:
{"items": [{"name": "string", "unit_price": number, "quantity": number}]}

Rules:
- "unit_price" is the price for ONE unit, not the line total. If the receipt only shows a line total, divide by quantity.
- "quantity" defaults to 1 if not shown.
- Ignore subtotals, tax lines, totals, payment method, loyalty program text, and store header/footer info.
- Use plain item names (clean up obvious abbreviations, otherwise keep as printed).
- If you cannot read the receipt at all, return {"items": []}.`

// Every strategy asks for a bare JSON object, but models occasionally wrap
// it in a markdown code fence anyway — this strips that defensively before
// JSON.parse, rather than trusting each provider's instruction-following.
export function extractJsonItems(rawText) {
  const cleaned = (rawText || '{}').trim().replace(/^```json\s*|^```\s*|```$/g, '')
  let parsed
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error("Could not parse the model's response as JSON")
  }
  return parsed.items || []
}
