import { parseNumber } from '../parseNumber'

// A price sits at the right edge of a receipt line, in the near-universal
// "1 to 4 digits, decimal separator, exactly 2 digits" shape — this is what
// makes the whole approach store-agnostic: it's a layout convention, not
// knowledge about any particular store's format.
const PRICE_RE = /^-?\d{1,4}[.,]\d{2}$/
const SINGLE_LETTER_RE = /^[A-Za-z]$/

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
  'pagamento',
]

function isNoiseLine(name) {
  const lower = name.toLowerCase()
  return NOISE_WORDS.some((w) => lower.includes(w))
}

// A subset of NOISE_WORDS that specifically mark a receipt's total line,
// rather than just one boilerplate line among others — everything on a
// receipt always comes *before* its total, so hitting one of these means
// every line after it is payment/footer metadata (card details, a second
// "thank you" copy, sometimes a whole duplicate merchant-copy receipt), not
// more purchased items. isNoiseLine alone would only skip that one line and
// keep scanning, which is how a card brand name or "Payment successful"
// sitting next to its own total figure further down could otherwise get
// picked up as a fake extra item.
const TOTAL_MARKERS = ['total', 'subtotal', 'totale', 'subtotale']

function isTotalLine(name) {
  const lower = name.toLowerCase()
  return TOTAL_MARKERS.some((w) => lower.includes(w))
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
    // Zero isn't a real price and usually means a bad OCR read, but a
    // negative price is a legitimate discount line (e.g. "-0.50" right
    // after an item) and should come through as its own line rather than
    // being silently dropped — this used to filter those out too.
    if (!Number.isFinite(price) || price === 0) continue

    let nameWords = sorted.slice(0, priceIndex).map((w) => w.text)

    // Pull a leading "2x" / "3 x" quantity prefix out of the name, if present.
    let quantity = 1
    if (nameWords.length && /^\d+[x×]$/i.test(nameWords[0])) {
      quantity = parseInt(nameWords[0], 10) || 1
      nameWords = nameWords.slice(1)
    }

    // A single stray letter right before the price is a per-line VAT-rate
    // code (e.g. Italian fiscal receipts print "A"/"B"/"E" in their own
    // column just left of the price, one per tax band) — never part of a
    // real item name, so it's stripped the same way the quantity prefix
    // above is. Left in place otherwise: a real one-letter item name isn't
    // a realistic thing to lose, and this only ever touches the one word
    // immediately adjacent to the price.
    if (nameWords.length > 1 && SINGLE_LETTER_RE.test(nameWords[nameWords.length - 1])) {
      nameWords = nameWords.slice(0, -1)
    }

    const name = nameWords.join(' ').trim()
    if (!name) continue
    // Stop entirely, not just skip this one line — see TOTAL_MARKERS above.
    if (isTotalLine(name)) break
    if (isNoiseLine(name)) continue

    items.push({ name, unit_price: price, quantity })
  }

  return items
}
