import { extractSplitwiseCategoryFromNote, matchCategoryByName } from './categoryMatch'

// Normalizes a bill's title for grouping "the same merchant, typed
// identically" together — trimmed, internal whitespace collapsed, and
// lowercased for comparison only; the *display* title shown to whoever's
// reviewing keeps whichever bill's original casing showed up first.
function normalizeTitle(title) {
  return (title || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

// Groups every uncategorized bill by its (normalized) title and runs the
// free Splitwise-note pass on each group in the same walk — no I/O, fully
// synchronous and testable on its own. `bills` need `id`, `title`, `note`,
// and `total` (each bill's own total cost, in currency units — see
// billTotal() in src/lib/billFilters.js, the same helper every other page
// uses to derive it from items). A title-less bill (shouldn't exist, but
// bills.title has no not-null constraint enforced beyond the app's own
// default) is skipped rather than grouped under an empty string.
//
// `total` is *not* fed to the AI pass — a category is a nominal judgment
// about what kind of merchant this is, not something a single euro amount
// reliably signals (a €15 charge could be groceries, a cheap dinner, or a
// subscription, with nothing to tell those apart). It's kept here purely
// for the review screen, in each group's own `totalAmount` — a person
// recognizing "oh, that one was ~€40 three times" is often exactly the
// context a cryptic or joking title needs, even when the title alone
// gives an AI nothing to go on.
//
// Each group's source/suggestedCategoryId reflects the *first* bill in
// the group with a matchable Splitwise category — bills sharing an exact
// title would be surprising to disagree on category, but if they do,
// nothing here is final: the review screen lets a person retarget a whole
// group, and any individual bill can still be corrected by hand
// afterward regardless of what this suggested.
export function buildTitleGroups(bills, categories) {
  const groups = new Map() // normalized title -> group

  for (const bill of bills) {
    const key = normalizeTitle(bill.title)
    if (!key) continue

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        title: bill.title.trim(),
        billIds: [],
        totalAmount: 0,
        source: 'none', // 'splitwise' | 'ai' | 'none'
        suggestedCategoryId: null,
      })
    }
    const group = groups.get(key)
    group.billIds.push(bill.id)
    group.totalAmount += Number(bill.total) || 0

    if (group.source === 'none') {
      const splitwiseCategory = extractSplitwiseCategoryFromNote(bill.note)
      const matched = matchCategoryByName(splitwiseCategory, categories)
      if (matched) {
        group.source = 'splitwise'
        group.suggestedCategoryId = matched.id
      }
    }
  }

  return [...groups.values()]
}

// Folds AI suggestions (title -> category name | null, see
// classifyTitles() in billCategorization/index.js) into whichever groups
// still have no suggestion — the AI pass is only ever asked about titles
// that didn't already get a Splitwise match (see CategorizeBills.jsx), so
// this only ever fills in group.source === 'none' groups, never
// overwrites an existing one.
export function applyAiSuggestions(groups, aiResultsByTitle, categories) {
  const byName = new Map(categories.map((c) => [c.name, c]))
  return groups.map((group) => {
    if (group.source !== 'none') return group
    const suggestedName = aiResultsByTitle.get(group.title)
    if (!suggestedName) return group
    const category = byName.get(suggestedName)
    if (!category) return group
    return { ...group, source: 'ai', suggestedCategoryId: category.id }
  })
}
