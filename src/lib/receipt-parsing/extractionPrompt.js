import { parseJsonResponse } from '../parseJsonResponse'

// Shared by every cloud/local vision-model strategy (Gemini, Claude, Ollama)
// — kept in one place so the three don't quietly drift out of sync.
//
// `categoryNames` is the group's own category list — when the model's
// already looking at the receipt image to extract items, asking it to also
// guess each item's category is nearly free (same call, same image), and
// saves re-tagging a whole receipt by hand afterward. Omit it (or pass an
// empty list) to get the plain item-extraction prompt with no category
// section at all — used when a group has no categories yet, same as the
// bill-categorization wizard's own landing-page gate.
export function buildExtractionPrompt(categoryNames = []) {
  const hasCategories = categoryNames.length > 0
  const categoryList = categoryNames.map((name) => `"${name}"`).join(', ')

  const categorySection = hasCategories
    ? `

For each item, also suggest which of this household's own categories it most likely belongs to — based on its name, its brand, and its price (a €0.99 line is more likely a small snack than a bottle of wine, for instance). Choose ONLY from this exact list, or null if none clearly fit:
[${categoryList}]

Receipts abbreviate and generalize constantly — a line might read "FR ROSSA" for red fruit, or lump a whole counter under one word like "DELI" or the Italian "GASTRONOMIA" rather than naming the actual product. That's fine: you don't need to know exactly what the item is, just its most likely broad category. Use null whenever you're not reasonably confident — every item gets reviewed by a person after scanning anyway, so a confidently wrong guess is worse than an honest blank.`
    : ''

  return `You are reading a photo of a shopping/grocery receipt. Extract every purchased line item.

Return ONLY a JSON object, no other text, no markdown fences, in exactly this shape:
{"items": [{"name": "string", "unit_price": number, "quantity": number${hasCategories ? ', "category": "string from the list below, or null"' : ''}}]}
${categorySection}

Rules:
- "unit_price" is the price for ONE unit, not the line total. If the receipt only shows a line total, divide by quantity.
- "quantity" defaults to 1 if not shown.
- Ignore subtotals, tax lines, totals, payment method, loyalty program text, and store header/footer info.
- Use plain item names (clean up obvious abbreviations, otherwise keep as printed).
- Some receipts show a discount as its own line with a negative price, right after the item it applies to (e.g. "-0.50" or "SCONTO -0.50"). When it's clearly tied to one specific item, subtract it from that item's unit_price directly instead of listing it separately. If you can't confidently tell which item a discount belongs to, include it as its own line with a negative unit_price and a name like "Discount" — never drop it silently.
- If you cannot read the receipt at all, return {"items": []}.`
}

// Resolves each item's raw `category` text (if any) against the group's
// actual category names — case-insensitive, and never anything the model
// invented outside that list, same defensive contract as
// parseClassifyResponse() in billCategorization/classifyPrompt.js. An item
// the model didn't (or couldn't) tag ends up with category: null, same as
// one it was never asked about at all.
export function extractJsonItems(rawText, categoryNames = []) {
  const items = parseJsonResponse(rawText).items || []
  if (categoryNames.length === 0) return items

  const byLowercase = new Map(categoryNames.map((name) => [name.toLowerCase(), name]))
  return items.map((item) => {
    const raw = typeof item.category === 'string' ? item.category.trim().toLowerCase() : null
    return { ...item, category: raw ? byLowercase.get(raw) || null : null }
  })
}
