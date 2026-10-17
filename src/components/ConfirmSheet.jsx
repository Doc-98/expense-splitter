import { useEffect, useRef } from 'react'
import { useEscapeKey } from '../lib/useEscapeKey'

// A bottom-sheet confirm dialog: every yes/no confirmation in the app uses
// this, never the browser's own window.confirm() — Sign Out, Leave group,
// deleting a bill, undoing a payment and so on (most through useConfirm,
// which turns it into `await confirm(...)`). TypedConfirmSheet covers the
// ones that need a typed confirmation (Delete all bills, Delete group), and
// the centered .modal-panel content-heavy dialogs (MultiPayerModal and
// friends) unrelated to confirming an action.
//
// `tone` is 'danger' (the default) for anything destructive, 'primary' for
// a confirm that isn't (making someone admin). Focus moves onto the panel
// itself, so a screen reader announces the question and Tab reaches Cancel
// first; focusing Cancel instead drew the keyboard focus ring on it after a
// plain finger tap. data-own-keys keeps a list's keyboard shortcuts behind
// the sheet from acting on keys meant for it.
export default function ConfirmSheet({ title, body, confirmLabel, tone = 'danger', onConfirm, onCancel }) {
  useEscapeKey(onCancel, true)
  const panelRef = useRef(null)
  useEffect(() => panelRef.current?.focus(), [])

  return (
    <div className="sheet-backdrop" data-own-keys onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        className="sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-sheet-title"
        tabIndex={-1}
        ref={panelRef}
        style={{ outline: 'none' }}
      >
        <div className="sheet-grabber" aria-hidden="true" />
        <h2 id="confirm-sheet-title">{title}</h2>
        <p>{body}</p>
        <div className="sheet-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={tone === 'primary' ? 'btn-primary' : 'btn-danger'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
