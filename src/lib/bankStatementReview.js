// Pure, standalone-testable pieces of ImportBankStatement.jsx's own review
// setup — split out here (rather than left as page-local helpers) so they
// can be unit tested without mounting the page, same reasoning as
// billCategorization/classifyPrompt.js living apart from the components
// that call it.

// Starting point for a freshly-parsed transaction — `reviewed` is what
// separates "you've actually looked at and confirmed this one" from a
// still-default value, both on a first pass and on resuming a draft.
// billId/itemId stay null until the first time this entry is confirmed
// with include: true — after that, confirming it again (via Back, editing
// something, then Next again) updates those same rows instead of
// inserting a duplicate. See bank_import_drafts in schema.sql.
//
// categoryId is pre-filled from tx.categoryHint whenever hintCategoryMap
// (lowercased hint -> categoryId or null, see resolveCategoryHints below)
// already has an answer for it — either because it matched one of this
// group's real category names exactly (the shape the "bring your own AI
// chat" path's own prompt always produces, see byoAiPrompt in
// ImportBankStatement.jsx), or because a person already matched that exact
// bank category name to one of this group's categories, just now or on a
// previous import (see bankCategoryMappings.js). A hint with no answer in
// the map at all never reaches here — resolveCategoryHints treats that as
// still needing to be asked about, not resolved to blank. A
// resolved-but-empty categoryId (mapped to "leave uncategorized") is a
// deliberate answer, same as one resolving to a real category: falling
// back to '' either way is what a blank entry already means, pickable by
// hand or by this app's own AI suggestion pass.
export function initialReviewEntry(tx, duplicates, crossMatches, index, hintCategoryMap) {
  const hintedCategoryId = tx.categoryHint ? hintCategoryMap.get(tx.categoryHint.toLowerCase()) : null
  return {
    include: tx.direction === 'debit' && !duplicates.has(index) && !crossMatches.has(index),
    categoryId: hintedCategoryId || '',
    description: undefined,
    reviewed: false,
    billId: null,
    itemId: null,
  }
}

// Splits every distinct categoryHint in a freshly-parsed statement into two
// buckets: `resolved` (lowercase hint -> categoryId | null) is already
// answered, either because it matches one of this group's real category
// names exactly (categoryNameToId — the shape the "bring your own AI chat"
// path's own prompt always produces) or because storedMappings already has
// a per-group answer from a previous import (bankCategoryMappings.js) —
// null there means "answered: leave uncategorized," not "never asked."
// `unresolved` is everything else: almost always a real bank's own category
// wording, which rarely matches this app's category names or even
// language, and has never been mapped before either — collected as
// { label, count } per hint (label keeps the original casing for display;
// count is only ever used to tell someone how much is riding on their
// answer) for ImportBankStatement's own "Match bank categories" step to ask
// about, once per name rather than once per transaction.
export function resolveCategoryHints(parsedTransactions, categoryNameToId, storedMappings) {
  const resolved = new Map()
  const unresolved = new Map()
  for (const tx of parsedTransactions) {
    if (!tx.categoryHint) continue
    const key = tx.categoryHint.toLowerCase()
    if (resolved.has(key)) continue
    if (unresolved.has(key)) {
      unresolved.get(key).count += 1
      continue
    }
    if (categoryNameToId.has(key)) {
      resolved.set(key, categoryNameToId.get(key))
    } else if (key in storedMappings) {
      resolved.set(key, storedMappings[key])
    } else {
      unresolved.set(key, { label: tx.categoryHint, count: 1 })
    }
  }
  return { resolved, unresolved }
}
