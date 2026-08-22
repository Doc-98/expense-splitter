import { useCurrency } from '../context/CurrencyContext'
import { parseNumber } from '../lib/parseNumber'
import InlineEditable from './InlineEditable'

// onUpdate(field, value) is called with one of 'name' | 'unit_price' |
// 'quantity' | 'total_price' and the raw new value — BillView.jsx's
// updateItemField() is the one place that knows how the other two money
// fields reconcile for each case (see the comment there). This component
// only validates that what was typed is well-formed at all (non-empty
// name, a real number for the money/quantity fields) before handing it up.
export default function ItemRow({ item, members, categories, billCategoryId, onToggleBuyer, onDelete, onCategoryChange, onUpdate }) {
  const { format } = useCurrency()
  const buyerIds = new Set(item.item_shares.map((s) => s.member_id))
  // Always show current members (whether checked or not), plus anyone no
  // longer active who's still assigned to this specific item — so a former
  // member's existing split stays visible on old items, but they don't show
  // up as a pickable option anywhere they weren't already assigned.
  const visibleMembers = members.filter((m) => m.active || buyerIds.has(m.id))

  // An item with no category of its own inherits the bill's — the dot
  // always reflects that *effective* category, not just what's literally
  // set on this one row, so it's an accurate at-a-glance summary either way.
  const effectiveCategoryId = item.category_id || billCategoryId
  const effectiveCategory = categories.find((c) => c.id === effectiveCategoryId)
  const billCategory = categories.find((c) => c.id === billCategoryId)

  // Supabase returns numeric columns as strings, not numbers — every
  // comparison/arithmetic below goes through this rather than the raw
  // item.quantity, same convention used everywhere else in this app.
  const quantity = Number(item.quantity) || 1

  function saveName(value) {
    const trimmed = value.trim()
    if (trimmed) onUpdate('name', trimmed)
  }

  function saveUnitPrice(value) {
    const price = parseNumber(value)
    if (!Number.isNaN(price)) onUpdate('unit_price', price)
  }

  function saveQuantity(value) {
    const qty = parseNumber(value)
    if (!Number.isNaN(qty) && qty > 0) onUpdate('quantity', qty)
  }

  function saveTotalPrice(value) {
    const total = parseNumber(value)
    if (!Number.isNaN(total)) onUpdate('total_price', total)
  }

  return (
    <div className="item-row">
      <div className="item-row-main">
        {effectiveCategory && (
          <span className="category-dot" style={{ background: effectiveCategory.color }} title={effectiveCategory.name} />
        )}
        <InlineEditable
          className="item-name item-editable"
          inputClassName="item-editable-input item-name-input"
          value={item.name}
          display={item.name}
          onSave={saveName}
          ariaLabel={`Rename ${item.name}`}
        />
        <span className="item-dots" aria-hidden="true" />
        <span className="item-price-detail mono">
          {/* Unit price is only worth its own editable spot when it isn't
              just repeating the total price to its right — at quantity 1
              the two are always the same number, so showing it twice would
              be redundant, not informative. The quantity itself ("x 1")
              still shows either way — it's the only place to fix a
              single-quantity item's amount without going through the total. */}
          {quantity !== 1 && (
            <>
              <InlineEditable
                className="item-editable"
                inputClassName="item-editable-input item-money-input"
                inputMode="decimal"
                value={String(item.unit_price)}
                display={format(item.unit_price)}
                onSave={saveUnitPrice}
                ariaLabel={`Unit price of ${item.name}`}
              />{' '}
            </>
          )}
          x{' '}
          <InlineEditable
            className="item-editable"
            inputClassName="item-editable-input item-qty-input"
            inputMode="decimal"
            value={String(item.quantity)}
            display={item.quantity}
            onSave={saveQuantity}
            ariaLabel={`Quantity of ${item.name}`}
          />
        </span>
        <InlineEditable
          className="item-editable mono item-price"
          inputClassName="item-editable-input item-money-input"
          inputMode="decimal"
          value={String(item.total_price)}
          display={format(item.total_price)}
          onSave={saveTotalPrice}
          ariaLabel={`Total price of ${item.name}`}
        />
        <button className="btn-icon" onClick={onDelete} aria-label={`Remove ${item.name}`}>
          ×
        </button>
      </div>
      <div className="item-buyers">
        <span className="item-buyers-label">Split with:</span>
        {visibleMembers.map((m) => (
          <label
            key={m.id}
            className={`buyer-chip ${buyerIds.has(m.id) ? 'active' : ''} ${m.active ? '' : 'former'}`}
          >
            <input type="checkbox" checked={buyerIds.has(m.id)} onChange={() => onToggleBuyer(m.id)} />
            {m.name}
            {m.isGuest && ' (guest)'}
            {!m.active && ' (left)'}
          </label>
        ))}
      </div>
      {categories.length > 0 && (
        <div className="item-category-row">
          <select value={item.category_id || ''} onChange={(e) => onCategoryChange(e.target.value)}>
            <option value="">{billCategory ? `Same as bill (${billCategory.name})` : 'Same as bill'}</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {buyerIds.size === 0 && (
        <p className="item-warning">No one's assigned yet — this item won't be counted in the settle-up.</p>
      )}
    </div>
  )
}
