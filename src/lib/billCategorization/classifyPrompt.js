import { parseJsonResponse } from '../parseJsonResponse'

// Builds the prompt for one batch of titles — kept separate from the
// per-provider strategy files (see strategies/) so the three don't drift
// out of sync on what's actually being asked, same reasoning as
// EXTRACTION_PROMPT in receipt-parsing/extractionPrompt.js.
//
// Asks for the *index* back, not the title text itself — a model
// paraphrasing, re-quoting, or subtly retyping a title (accents, an
// ellipsis, extra whitespace) would silently break a match-by-title-text
// mapping back to the original bills; an index into the same numbered
// list it was given has nothing to get subtly wrong.
export function buildClassifyPrompt(categoryNames, titles) {
  const categoryList = categoryNames.map((name) => `"${name}"`).join(', ')
  const titleList = titles.map((t, i) => `${i}. ${JSON.stringify(t)}`).join('\n')

  return `You are categorizing a list of expense bill titles for a household expense-tracking app. Each title is usually a short store or merchant name, sometimes with a date, note, or location attached — but some were typed by hand years ago and may be an in-joke, a nickname, or a personal reference between the people in the household rather than a literal merchant name (titles may be in any language). If a title doesn't clearly name a recognizable kind of business or expense, treat it as unclear rather than guessing from tone, wordplay, or a vague association — return null for it.

Categories available — choose ONLY from this exact list, or null if none clearly fit:
[${categoryList}]

For each numbered title below, pick the single best-fitting category from the list above based on what kind of merchant or expense it most likely names (e.g. a supermarket chain → a groceries-type category, a restaurant name → an eating-out-type category). Use null whenever you're not reasonably confident — guessing wrong is worse than leaving it blank, since a person reviews every suggestion before anything is saved.

Return ONLY a JSON object, no other text, no markdown fences, in exactly this shape:
{"results": [{"index": number, "category": "string from the list above, or null"}]}

One result per title, "index" matching its number below.

Titles:
${titleList}`
}

// Tolerant of a model returning fewer/more results than titles, an
// out-of-range index, a category name it invented rather than copying
// from the list, or the whole response failing to parse at all — any of
// that just means those specific titles come back unresolved (null)
// rather than the whole batch being discarded. `titles.length` is used to
// size the returned array, not just to bound-check it.
export function parseClassifyResponse(rawText, titles, categoryNames) {
  // Keyed lowercase -> the category's real, correctly-cased name — despite
  // being told to copy the list exactly, a model occasionally still drifts
  // on capitalization; this accepts that without accepting a category it
  // didn't actually offer.
  const byLowercase = new Map(categoryNames.map((name) => [name.toLowerCase(), name]))
  const results = new Array(titles.length).fill(null)

  let parsed
  try {
    parsed = parseJsonResponse(rawText)
  } catch {
    return results
  }

  for (const entry of parsed.results || []) {
    const index = Number(entry?.index)
    if (!Number.isInteger(index) || index < 0 || index >= titles.length) continue
    const raw = typeof entry?.category === 'string' ? entry.category.trim().toLowerCase() : null
    results[index] = raw ? byLowercase.get(raw) || null : null
  }

  return results
}
