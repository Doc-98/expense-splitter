// Pure, standalone-testable pieces of ImportBankStatement.jsx's own review
// setup — split out here (rather than left as page-local helpers) so they
// can be unit tested without mounting the page, same reasoning as
// billCategorization/classifyPrompt.js living apart from the components
// that call it.
import { categoryFromMemory } from './bankStatementEvidence'

// Starting point for a freshly-parsed transaction — `reviewed` is what
// separates "you've actually looked at and confirmed this one" from a
// still-default value, both on a first pass and on resuming a draft.
// billId/itemId stay null until the first time this entry is confirmed
// with include: true — after that, confirming it again (via Back, editing
// something, then Next again) updates those same rows instead of
// inserting a duplicate. See bank_import_drafts in schema.sql.
//
// categoryId starts as the best guess available before any AI is asked,
// and categorySource says where it came from, so the card can say so and
// a later, better source knows whether it may replace it:
//
// - 'history': this merchant's earlier bills in this group all sit under
//   one category (`memory`, see buildCategoryMemory in
//   bankStatementEvidence.js). The person's own repeated choice, so it
//   outranks everything below and the AI isn't asked about it.
// - 'bank': the statement's own category for this row (tx.categoryHint),
//   through hintCategoryMap (lowercased hint -> categoryId or null, see
//   resolveCategoryHints below). A bank's label is a hint, not a fact — it
//   is often generic or wrong — so this is only a placeholder: the AI pass
//   replaces it (applySuggestions below), and it stays only when no AI is
//   set up or the AI couldn't be reached.
// - undefined: nothing to go on yet.
//
// Two more are set later: 'ai' (applySuggestions) and 'manual' (the person
// picked it on the card — never replaced by anything).
export function initialReviewEntry(tx, duplicates, crossMatches, index, hintCategoryMap, memory = new Map()) {
  const rememberedCategoryId = tx.direction === 'debit' ? categoryFromMemory(tx, memory) : null
  const hintedCategoryId = tx.categoryHint ? hintCategoryMap.get(tx.categoryHint.toLowerCase()) : null
  const entry = {
    include: tx.direction === 'debit' && !duplicates.has(index) && !crossMatches.has(index),
    categoryId: rememberedCategoryId || hintedCategoryId || '',
    description: undefined,
    reviewed: false,
    billId: null,
    itemId: null,
  }
  if (rememberedCategoryId) entry.categorySource = 'history'
  else if (hintedCategoryId) entry.categorySource = 'bank'
  return entry
}

// Splits every distinct categoryHint on a freshly-parsed statement's
// spending rows into two buckets (money coming in never gets a card, so
// its categories — "Stipendio", "Entrate varie" — are never asked about):
// `resolved` (lowercase hint -> categoryId | null) is already answered,
// either because it matches one of this group's real category names
// exactly (categoryNameToId — the shape the "bring your own AI chat"
// path's own prompt always produces) or because storedMappings already has
// a per-group answer from a previous import (bankCategoryMappings.js) —
// null there means "answered: leave uncategorized," not "never asked."
// `unresolved` is everything else: almost always a real bank's own category
// wording, which rarely matches this app's category names or even
// language, and has never been mapped before either — collected as
// { label, count } per hint (label keeps the original casing for display;
// count is only ever used to tell someone how much is riding on their
// answer) for ImportBankStatement's own "Match bank categories" step to ask
// about, once per name rather than once per transaction. That step only
// runs when no AI is set up: an AI reads the bank's wording itself.
export function resolveCategoryHints(parsedTransactions, categoryNameToId, storedMappings) {
  const resolved = new Map()
  const unresolved = new Map()
  for (const tx of parsedTransactions) {
    if (!tx.categoryHint || tx.direction === 'credit') continue
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

// Whether the AI should still be asked about this transaction: a spending
// row nobody has confirmed yet, whose category is either still empty and
// never asked about, or only the bank's placeholder. Anything from
// history, from the AI itself (including "asked, no answer": source 'ai'
// with an empty category) or picked by hand is left alone — which also
// makes a second run after resuming a draft ask only about what the first
// run didn't get to.
export function needsSuggestion(tx, entry) {
  if (tx.direction !== 'debit' || !entry || entry.reviewed) return false
  if (entry.categorySource === 'bank') return true
  return !entry.categoryId && !entry.categorySource
}

// Folds the AI's answers into the review list. `results` is
// classifyEntries()' Map(key -> category name | null) and `keyOf(tx)` the
// key each transaction was asked under. An answer replaces whatever was
// there, the bank's placeholder included; "can't tell" (null, or a name
// that isn't one of this group's categories) clears it, since the AI saw
// the bank's category too and still wouldn't commit. A transaction missing
// from `results` (its batch failed) keeps what it had.
export function applySuggestions(review, transactions, results, keyOf, categoryIdByName) {
  return review.map((entry, i) => {
    const tx = transactions[i]
    if (!needsSuggestion(tx, entry)) return entry
    const key = keyOf(tx)
    if (!results.has(key)) return entry
    const categoryId = categoryIdByName.get(results.get(key)) || ''
    return { ...entry, categoryId, categorySource: 'ai' }
  })
}
