import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { billTotal } from '../lib/billFilters'
import { useLongPress } from '../lib/useLongPress'
import { useSwipeToDelete } from '../lib/useSwipeToDelete'
import { useCurrency } from '../context/CurrencyContext'
import BillActionsMenu from './BillActionsMenu'

// The group page's bill list: this page of bills under month and day
// dividers, each row a link to the bill with its ⋮ menu, swipe-to-delete
// and press-and-hold into select mode — or, in select mode, a checkbox
// row; or, mid-rename, an inline rename form. The page owns paging,
// selection and keyboard navigation (`billNav`, see useListKeyboardNav.js)
// and hands them in; renaming lives here.
export default function GroupBillList({
  groupId,
  group,
  billGroups,
  visibleBills,
  billNav,
  activeBillId,
  billPersonalTotals,
  myParticipantId,
  showLentBorrowedStatus,
  selectMode,
  selectedIds,
  onToggleSelected,
  onEnterSelectMode,
  onShare,
  onDelete,
  setError,
  refreshBills,
}) {
  const { format } = useCurrency()
  // Which bill (if any) is mid-rename via the ⋮ menu's own "Rename" —
  // same two-state shape (an id + a draft string) as GroupCategoriesSection/
  // GroupGuestsSection's own editing*Id/editing*Name pairs, and the same
  // reason: the draft needs to live in state independently of the bill
  // list itself so typing doesn't touch the real title until Save actually
  // commits it (see saveBillRename below).
  const [editingBillId, setEditingBillId] = useState(null)
  const [editingBillTitle, setEditingBillTitle] = useState('')

  // Press-and-hold a bill row as a faster, mobile-friendly way into select
  // mode alongside the existing "⋮ → Select" entry point — see
  // useLongPress.js for the gesture itself.
  const bindLongPress = useLongPress()
  // Swipe-left-to-reveal-delete, same gesture/hook as ItemRow's item list
  // and GroupGuestsSection's guest list — see useSwipeToDelete.js.
  const { bind: bindSwipe } = useSwipeToDelete()

  // A bill row needs *both* gestures on the same element — long-press
  // (enters select mode) and swipe (reveals delete) — and each hook
  // returns its own onPointerDown/Move/Up/Cancel, so spreading both
  // objects onto one element would just have the second one silently
  // clobber the first's same-named handlers instead of both ever running.
  // Combined here by calling both hooks' versions of each shared handler.
  // They don't fight over the gesture itself: a real drag crosses
  // useSwipeToDelete's own 8px threshold before useLongPress's 10px
  // move-tolerance cancels its timer, and each hook swallows the
  // trailing click strictly on its *own* flag (wasDragRef for swipe,
  // firedRef for long-press) — a genuine swipe never sets firedRef, and
  // a genuine long-press (held still, no drag) never sets wasDragRef —
  // so whichever one actually fired is the only one that intercepts the
  // click, and open-then-tap-to-close (swipe's isOpen check) still works
  // exactly as it does on any other swipeable row.
  function bindBillRow(bill) {
    const press = bindLongPress(() => onEnterSelectMode(bill.id))
    const swipe = bindSwipe(bill.id, () => onDelete(bill))
    return {
      row: {
        ...press,
        ...swipe.row,
        onPointerDown: (e) => {
          press.onPointerDown(e)
          swipe.row.onPointerDown(e)
        },
        onPointerMove: (e) => {
          press.onPointerMove(e)
          swipe.row.onPointerMove(e)
        },
        onPointerUp: (e) => {
          press.onPointerUp(e)
          swipe.row.onPointerUp(e)
        },
        onPointerCancel: (e) => {
          press.onPointerCancel(e)
          swipe.row.onPointerCancel(e)
        },
      },
      deleteButton: swipe.deleteButton,
    }
  }

  // Entry point is the ⋮ menu's own "Rename" (see BillActionsMenu below) —
  // no confirm step, same as every other rename in this app (a group's own
  // name, a category, a guest). Same empty-stays-unrenamed guard as those
  // too, just inlined here rather than going through InlineEditable, since
  // this is a full replace-the-row form, not a click-to-edit value in
  // place.
  async function saveBillRename(billId) {
    const trimmed = editingBillTitle.trim()
    if (!trimmed) return
    setError(null)
    const { error: renameError } = await supabase.from('bills').update({ title: trimmed }).eq('id', billId)
    if (renameError) {
      setError(renameError.message)
      return
    }
    setEditingBillId(null)
    refreshBills([billId])
  }

  function renderBill(bill) {
    const billLabel = (
      <span className="card-list-item-main">
        <span className="card-list-item-title">{bill.title}</span>
        {bill.note && <span className="card-list-item-note">{bill.note}</span>}
      </span>
    )
    // Undefined (not just zero) means "never touched this bill in either
    // direction" — computeSpendingTotals only creates an entry for someone
    // who paid and/or had at least one item assigned, same convention as
    // the group's own overall balance.
    const mine = billPersonalTotals[bill.id]?.[myParticipantId]
    const net = mine ? Math.round((mine.paid - mine.consumed) * 100) / 100 : null
    const billAmount = (
      <span className="bill-amount-block">
        <span className="mono bill-amount-total">{format(billTotal(bill))}</span>
        {/* "Lent"/"borrowed" only means anything when there's someone else
            in the bill to lend to or borrow from — in the Personal space
            it's always just your own money, so this line never says
            anything a personal user doesn't already know. */}
        {group &&
          !group.is_personal &&
          showLentBorrowedStatus &&
          (net === null ? (
            <span className="bill-amount-status bill-amount-status-neutral">You are not involved</span>
          ) : net < 0 ? (
            <span className="bill-amount-status balance-negative">
              You borrowed <span className="balance-amount">{format(-net)}</span>
            </span>
          ) : (
            <span className="bill-amount-status balance-positive">
              You lent <span className="balance-amount">{format(net)}</span>
            </span>
          ))}
      </span>
    )
    const flatIndex = visibleBills.findIndex((b) => b.id === bill.id)
    const isFocused = billNav.active && !selectMode && flatIndex === billNav.focusedIndex

    let content
    if (editingBillId === bill.id) {
      // Reuses .guest-rename-form's shape verbatim — Categories already
      // does the same rather than this being its own bespoke form — with
      // its own border/padding/radius here matching .bill-row-outer
      // exactly (see styles.css) so swapping into "renaming" and back
      // doesn't shift this row's size against its still-normal siblings
      // in the same list.
      content = (
        <form
          className="guest-rename-form"
          onSubmit={(e) => {
            e.preventDefault()
            saveBillRename(bill.id)
          }}
        >
          <input
            value={editingBillTitle}
            onChange={(e) => setEditingBillTitle(e.target.value)}
            aria-label={`Rename ${bill.title}`}
            autoFocus
          />
          <button type="submit" className="btn-link">
            Save
          </button>
          <button type="button" className="btn-link" onClick={() => setEditingBillId(null)}>
            Cancel
          </button>
        </form>
      )
    } else if (selectMode) {
      content = (
        <label className="card-list-item bill-select-row">
          {billLabel}
          <span className="bill-row-right">
            {billAmount}
            <input type="checkbox" checked={selectedIds.has(bill.id)} onChange={() => onToggleSelected(bill.id)} />
          </span>
        </label>
      )
    } else {
      const billBind = bindBillRow(bill)
      // One bordered rectangle for the whole row, same shape as
      // GroupGuestsSection's .guest-row-outer — the ⋮ menu sits inside it,
      // at the far right, replacing what used to be a decorative chevron
      // that didn't actually do anything. It's a fixed sibling of the
      // swipe shell rather than nested inside the sliding Link: its
      // popover needs to escape this row's own bounds, which it can't do
      // from inside a container that clips overflow to slide the row.
      content = (
        <div className="bill-row-outer">
          <div className="bill-row-shell">
            <button type="button" className="item-row-delete-action" {...billBind.deleteButton}>
              Remove
            </button>
            <Link
              to={`/groups/${groupId}/bills/${bill.id}`}
              className={`card-list-item ${String(bill.id) === activeBillId ? 'is-current' : ''}`}
              aria-current={String(bill.id) === activeBillId ? 'page' : undefined}
              {...billBind.row}
            >
              {billLabel}
              <span className="bill-row-right">{billAmount}</span>
            </Link>
          </div>
          <BillActionsMenu
            billTitle={bill.title}
            onRename={() => {
              setEditingBillId(bill.id)
              setEditingBillTitle(bill.title)
            }}
            onSelect={() => onEnterSelectMode(bill.id)}
            onShare={() => onShare([bill.id])}
            onDelete={() => onDelete(bill)}
          />
        </div>
      )
    }

    return (
      <li
        key={bill.id}
        className={`bill-list-item${isFocused ? ' list-row-focused' : ''}`}
        ref={isFocused ? billNav.rowRef : null}
      >
        {content}
      </li>
    )
  }

  return (
    <div className="bill-groups" onMouseMove={billNav.onListMouseMove}>
      {billGroups.map((monthGroup) => (
        <div key={monthGroup.key} className="bill-month-group">
          <h3 className="bill-month-divider">{monthGroup.label}</h3>
          {monthGroup.days.map((dayGroup) => (
            <div key={dayGroup.key}>
              <div className="bill-day-divider">{dayGroup.label}</div>
              <ul className="card-list">{dayGroup.items.map(renderBill)}</ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
