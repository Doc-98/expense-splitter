export default function ItemRow({ item, members, onToggleBuyer, onDelete }) {
  const buyerIds = new Set(item.item_shares.map((s) => s.user_id))
  // Always show current members (whether checked or not), plus anyone no
  // longer active who's still assigned to this specific item — so a former
  // member's existing split stays visible on old items, but they don't show
  // up as a pickable option anywhere they weren't already assigned.
  const visibleMembers = members.filter((m) => m.active || buyerIds.has(m.id))

  return (
    <div className="item-row">
      <div className="item-row-main">
        <span className="item-name">{item.name}</span>
        <span className="item-dots" aria-hidden="true" />
        <span className="mono item-price">€{Number(item.total_price).toFixed(2)}</span>
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
            {!m.active && ' (left)'}
          </label>
        ))}
      </div>
      {buyerIds.size === 0 && (
        <p className="item-warning">No one's assigned yet — this item won't be counted in the settle-up.</p>
      )}
    </div>
  )
}
