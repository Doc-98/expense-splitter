// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { extractItemsFromLines } from './lineParser'

// Builds one "line" the way Tesseract/pdfText.js hand them over — an array
// of {text, x} words, x increasing left to right. Order here is already
// left-to-right, same as real input almost always is, but extractItemsFromLines
// re-sorts by x itself regardless.
function line(...words) {
  return words.map((text, i) => ({ text, x: i * 10 }))
}

describe('extractItemsFromLines', () => {
  it('splits a plain "name price" line', () => {
    const items = extractItemsFromLines([line('Bananas', '2,50')])
    expect(items).toEqual([{ name: 'Bananas', unit_price: 2.5, quantity: 1 }])
  })

  it('pulls a leading "2x" quantity prefix out of the name', () => {
    const items = extractItemsFromLines([line('3x', 'Apples', '4,50')])
    expect(items).toEqual([{ name: 'Apples', unit_price: 4.5, quantity: 3 }])
  })

  it('picks the rightmost price-shaped word, not the first one', () => {
    // A name that happens to contain something price-shaped (a product
    // code, say) shouldn't be mistaken for the actual price.
    const items = extractItemsFromLines([line('Item', '12,00', 'ml', '3,99')])
    expect(items).toEqual([{ name: 'Item 12,00 ml', unit_price: 3.99, quantity: 1 }])
  })

  it('skips a line with nothing price-shaped on it', () => {
    expect(extractItemsFromLines([line('Thank you for shopping')])).toEqual([])
  })

  it('drops a negative-price line rather than treating 0 as valid', () => {
    expect(extractItemsFromLines([line('Discount', '0,00')])).toEqual([])
    expect(extractItemsFromLines([line('Discount', '-0,50')])).toEqual([
      { name: 'Discount', unit_price: -0.5, quantity: 1 },
    ])
  })

  it('filters out a noise line (tax, change, card, etc.)', () => {
    const items = extractItemsFromLines([line('TAX', '1,20'), line('Bananas', '2,50'), line('CASH', '10,00')])
    expect(items).toEqual([{ name: 'Bananas', unit_price: 2.5, quantity: 1 }])
  })

  // Both of these came directly out of testing against a real Italian
  // supermarket receipt PDF: every item line there carries a one-letter
  // VAT-rate code (A/B/E) in its own column just before the price, and the
  // printout continues for several more lines *after* the real total
  // (payment method, card details, a second merchant-copy receipt) — all
  // of which have their own numbers that look exactly like a price.
  it('strips a trailing single-letter VAT code from the item name', () => {
    const items = extractItemsFromLines([line('UVA', 'PIZZUTELLA', 'AL', 'KG', 'A', '3,85')])
    expect(items).toEqual([{ name: 'UVA PIZZUTELLA AL KG', unit_price: 3.85, quantity: 1 }])
  })

  it('does not strip a one-letter word that is the entire name', () => {
    // nameWords.length > 1 guards this — a genuinely one-word, one-letter
    // name has nothing left to fall back to, so it's kept rather than
    // discarded into an empty name.
    const items = extractItemsFromLines([line('X', '1,50')])
    expect(items).toEqual([{ name: 'X', unit_price: 1.5, quantity: 1 }])
  })

  it('stops reading items entirely at the total line, not just skipping it', () => {
    const items = extractItemsFromLines([
      line('Bananas', 'A', '2,50'),
      line('Apples', 'B', '4,50'),
      line('TOTALE COMPLESSIVO', '7,00'),
      line('MASTERCARD', '7,00'),
      line('RICEVUTA', 'DI', 'PAGAMENTO', '7,00'),
    ])
    expect(items).toEqual([
      { name: 'Bananas', unit_price: 2.5, quantity: 1 },
      { name: 'Apples', unit_price: 4.5, quantity: 1 },
    ])
  })

  it('reproduces the real receipt end to end: 3 items, VAT codes stripped, footer ignored', () => {
    const lines = [
      line('DESCRIZIONE', 'IVA', 'EURO'),
      line('UVA PIZZUTELLA AL KG', 'A', '3,85'),
      line('SACCHETTO MATER-B', 'E', '0,02'),
      line('ASPARAGI VERDI 500G', 'A', '6,99'),
      line('TOTALE ARTICOLI: 3'),
      line('TOTALE COMPLESSIVO EURO', '10,86'),
      line('di cui IVA', '0,75'),
      line('Pagamento elettronico', '10,86'),
      line('MASTERCARD', '10,86'),
    ]
    const items = extractItemsFromLines(lines)
    expect(items).toEqual([
      { name: 'UVA PIZZUTELLA AL KG', unit_price: 3.85, quantity: 1 },
      { name: 'SACCHETTO MATER-B', unit_price: 0.02, quantity: 1 },
      { name: 'ASPARAGI VERDI 500G', unit_price: 6.99, quantity: 1 },
    ])
    const sum = items.reduce((s, it) => s + it.unit_price * it.quantity, 0)
    expect(Math.round(sum * 100) / 100).toBe(10.86)
  })
})
