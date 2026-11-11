import { normalizeDescription } from './bankStatementDetection'

// What a bank statement import knows about a transaction's category before
// a person looks at it, beyond its title: the file's longer "details" text,
// the bank's own category for it, and what the same merchant was filed
// under on earlier imports. None of it is certain — it's evidence for a
// suggestion the person still reviews (see ImportBankStatement.jsx).

// The details text as sent to an AI service: the words only. A bank's
// details are mostly wrapped in numbers that say nothing about what was
// bought and shouldn't leave the device anyway — account and card numbers
// (masked or not), IBANs, mandate and terminal codes, dates and times.
// Dropped: IBAN-shaped tokens, masked-card runs (XXXX), and any token
// with a digit in it. What's left ("EFFETTUATO IL ALLE ORE MEDIANTE LA
// CARTA PRESSO ILIAD ITALIA Roma") still carries the merchant. Returns
// null when nothing useful is left, or it only repeats the title.
export function detailsForClassifier(details, description = '') {
  if (!details) return null
  const words = String(details)
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/gi, ' ') // IBAN
    .split(/\s+/)
    .filter((token) => token && !/\d/.test(token) && !/^[Xx*#•.\-/]+$/.test(token))
    .join(' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim()
  if (words.length < 3) return null
  if (words.toLowerCase() === String(description).trim().toLowerCase()) return null
  return words.length > 200 ? `${words.slice(0, 200)}…` : words
}

// Which category each merchant was filed under before, from this group's
// own bills: Map(merchant key -> categoryId). A merchant counts only when
// at least two categorized bills of theirs exist and every one agrees. A
// description that covers different things each time (a payment
// processor's direct debit, a transfer app) ends up under several
// categories and says nothing about the next one; and a single earlier
// bill isn't a habit yet — the AI gets a say first. `pastBills` is
// [{ description, categoryId }]; uncategorized ones are ignored.
export function buildCategoryMemory(pastBills) {
  const seen = new Map() // key -> Map(categoryId -> count)
  for (const bill of pastBills) {
    if (!bill.categoryId) continue
    const key = normalizeDescription(bill.description)
    if (!key) continue
    if (!seen.has(key)) seen.set(key, new Map())
    const counts = seen.get(key)
    counts.set(bill.categoryId, (counts.get(bill.categoryId) || 0) + 1)
  }
  const memory = new Map()
  for (const [key, counts] of seen) {
    if (counts.size !== 1) continue
    const [[categoryId, count]] = [...counts]
    if (count >= 2) memory.set(key, categoryId)
  }
  return memory
}

// The category this transaction's merchant was filed under before, or null.
export function categoryFromMemory(tx, memory) {
  return memory.get(normalizeDescription(tx.description)) || null
}

// One transaction as the AI classifier is asked about it (see
// buildClassifyPrompt): its title, plus whatever else the file says.
// `mappedCategoryName` is the category this person matched the bank's own
// category name to on an earlier import, if they did.
export function classifierEntry(tx, mappedCategoryName = null) {
  return {
    title: tx.description,
    details: detailsForClassifier(tx.details, tx.description),
    bankCategory: tx.categoryHint || null,
    bankCategoryMappedTo: tx.categoryHint ? mappedCategoryName : null,
  }
}
