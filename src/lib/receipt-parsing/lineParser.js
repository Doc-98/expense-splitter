import { parseNumber } from '../parseNumber'

// A price sits at the right edge of a receipt line, in the near-universal
// "1 to 4 digits, decimal separator, exactly 2 digits" shape — this is what
// makes the whole approach store-agnostic: it's a layout convention, not
// knowledge about any particular store's format.
const PRICE_RE = /^-?\d{1,4}[.,]\d{2}$/

// Boilerplate that shows up on receipts but isn't a purchased item. Kept
// intentionally short and generic (not a store-specific list) — this is a
// noise filter, not a parser for any particular receipt format.
const NOISE_WORDS = [
  'total',
  'subtotal',
  'tax',
  'vat',
  'change',
  'cash',
  'card',
  'balance',
  'totale',
  'subtotale',
  'iva',
  'resto',
  'contanti',
  'carta',
  'cassa',
  'scontrino',
  'cassiere',
  'grazie',
  'thank you',
  'thanks',
]

function isNoiseLine(name) {
  const lower = name.toLowerCase()
  return NOISE_WORDS.some((w) => lower.includes(w))
}

// Input: an array of "lines", each an array of {text, x} words already
// grouped by whatever produced them (Tesseract's own line segmentation, in
// practice) — x is each word's horizontal position, left to right.
// Output: parsed items in the same {name, unit_price, quantity} shape every
// other strategy returns.
export function extractItemsFromLines(lines) {
  const items = []

  for (const words of lines) {
    if (!words || words.length === 0) continue
    const sorted = [...words].sort((a, b) => a.x - b.x)

    // The price is the rightmost word on the line that looks like one.
    let priceIndex = -1
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (PRICE_RE.test(sorted[i].text)) {
        priceIndex = i
        break
      }
    }
    if (priceIndex === -1) continue

    const price = parseNumber(sorted[priceIndex].text)
    if (!Number.isFinite(price) || price <= 0) continue

    let nameWords = sorted.slice(0, priceIndex).map((w) => w.text)

    // Pull a leading "2x" / "3 x" quantity prefix out of the name, if present.
    let quantity = 1
    if (nameWords.length && /^\d+[x×]$/i.test(nameWords[0])) {
      quantity = parseInt(nameWords[0], 10) || 1
      nameWords = nameWords.slice(1)
    }

    const name = nameWords.join(' ').trim()
    if (!name || isNoiseLine(name)) continue

    items.push({ name, unit_price: price, quantity })
  }

  return items
}
