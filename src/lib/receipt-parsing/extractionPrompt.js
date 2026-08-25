import { parseJsonResponse } from '../parseJsonResponse'

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
- Some receipts show a discount as its own line with a negative price, right after the item it applies to (e.g. "-0.50" or "SCONTO -0.50"). When it's clearly tied to one specific item, subtract it from that item's unit_price directly instead of listing it separately. If you can't confidently tell which item a discount belongs to, include it as its own line with a negative unit_price and a name like "Discount" — never drop it silently.
- If you cannot read the receipt at all, return {"items": []}.`

export function extractJsonItems(rawText) {
  return parseJsonResponse(rawText).items || []
}
