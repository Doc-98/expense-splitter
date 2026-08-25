// Every bill this app has ever imported from Splitwise carries its
// original category in the note, verbatim — ImportBills.jsx writes
// "Imported from Splitwise (Category)" (or just "Imported from Splitwise"
// when Splitwise's own row had none) for every single one. That's a free,
// human-assigned signal already sitting on 1000+ real bills for anyone
// migrating a long history — this pulls it back out.
const SPLITWISE_NOTE_PATTERN = /Imported from Splitwise \(([^)]+)\)/

export function extractSplitwiseCategoryFromNote(note) {
  if (!note) return null
  const match = note.match(SPLITWISE_NOTE_PATTERN)
  return match ? match[1].trim() : null
}

// Splitwise's own default category names, lowercased, mapped to the
// closest match among this app's own default set (src/lib/categories.js)
// — covers the common case where a group's categories are still close to
// what create_group() seeded, without inventing anything new (a match has
// to already exist in the group's own category list to ever get used; see
// matchCategoryByName below). Not exhaustive of every custom category
// Splitwise offers — those simply won't match anything here and fall
// through to the AI pass, or stay uncategorized, same as any other name
// that doesn't line up with what this group actually has.
const SPLITWISE_CATEGORY_ALIASES = {
  'dining out': 'eating out',
  restaurant: 'eating out',
  restaurants: 'eating out',
  groceries: 'groceries',
  transportation: 'transport',
  taxi: 'transport',
  parking: 'transport',
  'gas/fuel': 'transport',
  car: 'transport',
  'medical expenses': 'health',
  health: 'health',
  utilities: 'bills & utilities',
  electricity: 'bills & utilities',
  heat: 'bills & utilities',
  rent: 'bills & utilities',
  mortgage: 'bills & utilities',
  household: 'household',
  'home supplies': 'household',
  furniture: 'household',
  electronics: 'household',
  entertainment: 'other',
  general: 'other',
  life: 'other',
}

// `rawName` is whatever text names a category — usually Splitwise's own
// (from extractSplitwiseCategoryFromNote above), sometimes the AI's raw
// suggestion. Only ever returns one of `categories` themselves (or null)
// — this never invents a new category, exact match against the group's
// own list first, then the alias table above as a fallback, both
// case-insensitive/trimmed since neither Splitwise's nor a model's
// capitalization is guaranteed to match this app's own.
export function matchCategoryByName(rawName, categories) {
  if (!rawName) return null
  const key = rawName.trim().toLowerCase()
  if (!key) return null

  const byName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c]))
  if (byName.has(key)) return byName.get(key)

  const aliasKey = SPLITWISE_CATEGORY_ALIASES[key]
  if (aliasKey && byName.has(aliasKey)) return byName.get(aliasKey)

  return null
}
