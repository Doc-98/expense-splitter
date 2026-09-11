import { useState } from 'react'
import { useCurrency } from '../context/CurrencyContext'
import { parseNumber, parseAmount } from '../lib/parseNumber'
import AvatarGlyph from './AvatarGlyph'
import InlineEditable from './InlineEditable'
import { ChevronIcon } from './icons'
import { avatarSizeSpec } from '../lib/groupViewPreferences'

// onUpdate(field, value) is called with one of 'name' | 'unit_price' |
// 'quantity' | 'total_price' and the raw new value — BillView.jsx's
// updateItemField() is the one place that knows how the other two money
// fields reconcile for each case (see the comment there). This component
// only validates that what was typed is well-formed at all (non-empty
// name, a real number for the money/quantity fields) before handing it up.
//
// Collapsed to one read-only line by default (category dot, name, a qty
// badge when it's not 1, the total) — tap it to expand into the actual
// editable fields plus split-with/category, rather than every item
// permanently showing its full buyer row and category picker whether
// you're touching it or not. `bindSwipe` comes from BillView.jsx's own
// single `useSwipeToDelete()` call (one per list, not one per row — see
// that hook for why) and wires up the swipe-left-to-reveal-delete gesture
// on the collapsed head; the same delete also stays reachable without the
// gesture via the "Remove item" button inside the expanded body, per that
// hook's own reasoning for never making a gesture the only way in.
export default function ItemRow({
  item,
  members,
  categories,
  billCategoryId,
  hideBuyers,
  onToggleBuyer,
  onDelete,
  onCategoryChange,
  onUpdate,
  bindSwipe,
  avatarSize,
}) {
  const { format } = useCurrency()
  const [open, setOpen] = useState(false)
  const { iconPx: avatarIconPx, className: avatarSizeClass } = avatarSizeSpec(avatarSize)
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
  const unassigned = !hideBuyers && buyerIds.size === 0

  function saveName(value) {
    const trimmed = value.trim()
    if (trimmed) onUpdate('name', trimmed)
  }

  // The two money fields go through parseAmount, not plain parseNumber —
  // typing a quick "2,30-1,25" to fix a price by hand is exactly what
  // this row's own inline edit is for (see parseNumber.js for why that's
  // opt-in rather than every numeric field here getting it for free;
  // quantity below deliberately still uses plain parseNumber).
  function saveUnitPrice(value) {
    const price = parseAmount(value)
    if (!Number.isNaN(price)) onUpdate('unit_price', price)
  }

  function saveQuantity(value) {
    const qty = parseNumber(value)
    if (!Number.isNaN(qty) && qty > 0) onUpdate('quantity', qty)
  }

  function saveTotalPrice(value) {
    const total = parseAmount(value)
    if (!Number.isNaN(total)) onUpdate('total_price', total)
  }

  const swipe = bindSwipe(item.id, onDelete)

  return (
    <div className={`item-row ${open ? 'is-open' : ''}`}>
      <div className="item-row-head-shell">
        <button type="button" className="item-row-delete-action" {...swipe.deleteButton}>
          Remove
        </button>
        <button type="button" className="item-row-head" onClick={() => setOpen((o) => !o)} {...swipe.row}>
          {effectiveCategory && (
            <span className="category-dot" style={{ background: effectiveCategory.color }} title={effectiveCategory.name} />
          )}
          <span className="item-name">{item.name}</span>
          {quantity !== 1 && <span className="item-qty-badge">{quantity}&times;</span>}
          <span className="item-dots" aria-hidden="true" />
          {unassigned && <span className="item-warn-dot" title="No one's assigned yet" />}
          <span className="item-price mono">{format(item.total_price)}</span>
          <ChevronIcon size={16} className="item-row-chevron" />
        </button>
      </div>

      <div className="xwrap">
        <div className="xinner">
          <div className="item-row-body">
            <div className="item-body-row">
              <span className="item-body-label">Item</span>
              <InlineEditable
                className="item-editable"
                inputClassName="item-editable-input item-name-input"
                value={item.name}
                display={item.name}
                onSave={saveName}
                ariaLabel={`Rename ${item.name}`}
              />
            </div>
            {quantity !== 1 && (
              <div className="item-body-row">
                <span className="item-body-label">Unit price</span>
                <InlineEditable
                  className="item-editable mono"
                  inputClassName="item-editable-input item-money-input"
                  inputMode="decimal"
                  pattern="[-+*/0-9.,() ]*"
                  value={String(item.unit_price)}
                  display={format(item.unit_price)}
                  onSave={saveUnitPrice}
                  ariaLabel={`Unit price of ${item.name}`}
                />
              </div>
            )}
            <div className="item-body-row">
              <span className="item-body-label">Quantity</span>
              <InlineEditable
                className="item-editable mono"
                inputClassName="item-editable-input item-qty-input"
                inputMode="decimal"
                value={String(item.quantity)}
                display={item.quantity}
                onSave={saveQuantity}
                ariaLabel={`Quantity of ${item.name}`}
              />
            </div>
            <div className="item-body-row">
              <span className="item-body-label">Total price</span>
              <InlineEditable
                className="item-editable mono"
                inputClassName="item-editable-input item-money-input"
                inputMode="decimal"
                pattern="[-+*/0-9.,() ]*"
                value={String(item.total_price)}
                display={format(item.total_price)}
                onSave={saveTotalPrice}
                ariaLabel={`Total price of ${item.name}`}
              />
            </div>
            {/* In a personal space there's only ever one member, so "split
                with" has nothing to actually offer — insertItemWithShares
                still assigns every new item to that one person automatically
                (see defaultBuyerIds in BillView.jsx), this is just the
                picker with nothing to pick. */}
            {!hideBuyers && (
              <div className="item-body-row">
                <span className="item-body-label">Split with</span>
                <div className="avatar-row">
                  {visibleMembers.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`avatar ${avatarSizeClass} ${buyerIds.has(m.id) ? 'active' : ''} ${m.active ? '' : 'former'}`}
                      title={`${m.name}${m.isGuest ? ' (guest)' : ''}${!m.active ? ' (left)' : ''}`}
                      onClick={() => onToggleBuyer(m.id)}
                    >
                      <AvatarGlyph iconId={m.avatarIcon} name={m.name} size={avatarIconPx} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {categories.length > 0 && (
              <div className="item-body-row">
                <span className="item-body-label">Category</span>
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
            {unassigned && (
              <p className="item-warning">No one's assigned yet — this item won't be counted in the settle-up.</p>
            )}
            <button type="button" className="item-remove-btn" onClick={onDelete}>
              Remove item
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
