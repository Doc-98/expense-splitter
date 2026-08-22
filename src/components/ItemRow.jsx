import { useState } from 'react'
import { useCurrency } from '../context/CurrencyContext'
import { parseNumber } from '../lib/parseNumber'

export default function ItemRow({ item, members, categories, billCategoryId, onToggleBuyer, onDelete, onCategoryChange, onUpdate }) {
  const { format } = useCurrency()
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(item.name)
  const [draftPrice, setDraftPrice] = useState(String(item.total_price))
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

  function startEdit() {
    setDraftName(item.name)
    setDraftPrice(String(item.total_price))
    setEditing(true)
  }

  // Editing changes the name and the line's total cost only — quantity and
  // unit price (used in CSV/recap exports, but never actually shown on this
  // row) aren't part of this form, so onUpdate is the one place that
  // decides how a new total reconciles with whatever quantity the item
  // already has. Not asking for a corrected quantity here too is deliberate
  // scope: this is for fixing a typo'd name or a wrong price, the two
  // things this row actually displays, not a full re-entry of the item.
  function saveEdit(e) {
    e.preventDefault()
    const name = draftName.trim()
    if (!name) return
    const price = parseNumber(draftPrice)
    if (Number.isNaN(price)) return
    onUpdate(name, price)
    setEditing(false)
  }

  return (
    <div className="item-row">
      {editing ? (
        <form className="item-edit-form" onSubmit={saveEdit}>
          <input value={draftName} onChange={(e) => setDraftName(e.target.value)} autoFocus />
          <input
            type="text"
            inputMode="decimal"
            value={draftPrice}
            onChange={(e) => setDraftPrice(e.target.value)}
            placeholder="0.00"
          />
          <button type="submit" className="btn-link">
            Save
          </button>
          <button type="button" className="btn-link" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <>
          <div className="item-row-main">
            {effectiveCategory && (
              <span className="category-dot" style={{ background: effectiveCategory.color }} title={effectiveCategory.name} />
            )}
            <span className="item-name">{item.name}</span>
            <span className="item-dots" aria-hidden="true" />
            <span className="mono item-price">{format(item.total_price)}</span>
            <button type="button" className="btn-link item-edit-btn" onClick={startEdit}>
              Edit
            </button>
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
        </>
      )}
    </div>
  )
}
