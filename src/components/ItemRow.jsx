import { useCurrency } from '../context/CurrencyContext'

export default function ItemRow({ item, members, categories, billCategoryId, onToggleBuyer, onDelete, onCategoryChange }) {
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

  return (
    <div className="item-row">
      <div className="item-row-main">
        {effectiveCategory && (
          <span className="category-dot" style={{ background: effectiveCategory.color }} title={effectiveCategory.name} />
        )}
        <span className="item-name">{item.name}</span>
        <span className="item-dots" aria-hidden="true" />
        <span className="mono item-price">{format(item.total_price)}</span>
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
