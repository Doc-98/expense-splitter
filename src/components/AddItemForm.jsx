import { useRef, useState } from 'react'
import { parseNumber, parseAmount } from '../lib/parseNumber'
import { ArrowRightIcon } from './icons'

// The bill page's add-item row: name, price and quantity, built for fast
// by-hand entry — Tab cycles only through the three fields, and after an
// item is added the name field is ready for the next one. `onAdd(name,
// unitPrice, quantity)` resolves to whether it was added. `nameRef` lets
// the page's empty state move you to the name field.
export default function AddItemForm({ nameRef, onAdd }) {
  const [newItem, setNewItem] = useState({ name: '', price: '', quantity: '1' })
  const qtyRef = useRef(null)

  // Price alone goes through parseAmount, not plain parseNumber — this is
  // the one field someone might type a quick "2,30-1,25" into by hand
  // (splitting a shared line total, subtracting a discount) — see
  // parseNumber.js for why that's a distinct, opt-in function rather than
  // something every numeric field on this page just gets for free. Used
  // both to gate the submit button (no price typed yet -> no arrow, same
  // "nothing to confirm" reasoning as the name check) and inside addItem
  // itself, so a row can't be added price-less by submitting the form
  // directly (Enter in the name field) either.
  function parsedPrice() {
    if (!newItem.price.trim()) return NaN
    return parseAmount(newItem.price)
  }
  const priceValid = !Number.isNaN(parsedPrice())

  async function addItem(e) {
    e.preventDefault()
    if (!newItem.name.trim() || !priceValid) return
    const quantity = parseNumber(newItem.quantity) || 1
    const added = await onAdd(newItem.name.trim(), parsedPrice(), quantity)
    if (!added) return
    setNewItem({ name: '', price: '', quantity: '1' })
    // Ready for the next item without reaching for the mouse.
    nameRef.current?.focus()
  }

  // Keeps Tab cycling only through name -> price -> qty -> name, instead of
  // continuing on to the Add button and beyond, for fast by-hand entry.
  function handleQtyKeyDown(e) {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      nameRef.current?.focus()
    }
  }
  function handleNameKeyDown(e) {
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault()
      qtyRef.current?.focus()
    }
  }

  return (
    <form onSubmit={addItem} className="add-item-form">
      <input
        ref={nameRef}
        placeholder="Item"
        value={newItem.name}
        onChange={(e) => setNewItem((v) => ({ ...v, name: e.target.value }))}
        onKeyDown={handleNameKeyDown}
      />
      <input
        placeholder="Price"
        inputMode="decimal"
        // Deliberately permissive — a real character allowlist, not an
        // attempt at validating a well-formed number/expression (that's
        // parseAmount's job downstream, which already fails gracefully
        // on garbage). This exists to get iOS to add a minus key to its
        // decimal pad (any pattern containing "-" does that), and now
        // also to admit everything parseAmount accepts — digits, either
        // decimal separator, and a small arithmetic expression like
        // "2,30-1,25" — without the browser's own pattern validation
        // silently blocking the submit before it ever reaches that
        // parsing. A stricter pattern here would just be two different
        // definitions of "valid" to keep in sync for no real benefit.
        pattern="[-+*/0-9.,() ]*"
        value={newItem.price}
        onChange={(e) => setNewItem((v) => ({ ...v, price: e.target.value }))}
      />
      <input
        ref={qtyRef}
        placeholder="Qty"
        inputMode="decimal"
        value={newItem.quantity}
        onChange={(e) => setNewItem((v) => ({ ...v, quantity: e.target.value }))}
        onKeyDown={handleQtyKeyDown}
      />
      {/* Same fading arrow-submit button Create group/Add bill/New
          category use, not the plain "Add" text button this used to be
          — reusing that pattern here even though it's a flex sibling
          rather than living inside a single input the way it does
          there (this form has three fields, so the input-with-submit
          approach doesn't have one input to anchor to). Gated the same
          way addItem() itself is: a name AND a real price are both
          required — quantity alone still falls back to 1 if left
          blank, but a price-less item was never a case worth letting
          through silently (see priceValid above). */}
      <button
        type="submit"
        className="row-submit-btn"
        disabled={!newItem.name.trim() || !priceValid}
        aria-label="Add item"
      >
        <ArrowRightIcon size={16} />
      </button>
    </form>
  )
}
