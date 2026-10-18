import { useCurrency } from '../context/CurrencyContext'
import InlineEditable from './InlineEditable'
import BuyerPicker from './BuyerPicker'
import { PlusIcon } from './icons'

// A one-item bill's plain view: the amount, who it's split with, and "Add
// another item" to itemize it. No stored mode — the bill page shows this
// purely because the bill has exactly one item (and "Add another item"
// hasn't been tapped). The item itself still exists underneath, same row
// a 2+-item bill would show; its name just stays hidden here since there's
// nothing to disambiguate it from yet.
export default function SimpleBillAmount({
  item,
  members,
  showSplit,
  avatarSize,
  onSaveAmount,
  onToggleBuyer,
  onOnlyBuyer,
  onAddAnother,
}) {
  const { format } = useCurrency()
  return (
    <>
      <div className="amount-card">
        <span className="amount-card-label">Amount</span>
        <InlineEditable
          className="amount-card-value mono"
          inputClassName="amount-card-value-input mono"
          inputMode="decimal"
          pattern="[-+*/0-9.,() ]*"
          value={String(item.total_price)}
          display={format(item.total_price)}
          onSave={onSaveAmount}
          ariaLabel="Bill amount"
        />
        {showSplit && (
          <div className="amount-card-split">
            <span className="amount-card-label">Split with</span>
            <BuyerPicker
              members={members}
              selectedIds={item.item_shares.map((s) => s.member_id)}
              onToggle={onToggleBuyer}
              onOnly={onOnlyBuyer}
              avatarSize={avatarSize}
            />
            {item.item_shares.length === 0 && (
              <p className="item-warning">No one's assigned yet — this bill won't be counted in the settle-up.</p>
            )}
          </div>
        )}
      </div>
      <button type="button" className="ghost-row" onClick={onAddAnother}>
        <PlusIcon size={16} />
        Add another item
      </button>
    </>
  )
}
