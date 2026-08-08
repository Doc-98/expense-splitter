export default function ItemRow({ item, members, onToggleBuyer, onDelete }) {
  const buyerIds = new Set(item.item_shares.map((s) => s.user_id))

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
        {members.map((m) => (
          <label key={m.id} className={buyerIds.has(m.id) ? 'buyer-chip active' : 'buyer-chip'}>
            <input type="checkbox" checked={buyerIds.has(m.id)} onChange={() => onToggleBuyer(m.id)} />
            {m.name}
          </label>
        ))}
      </div>
    </div>
  )
}
