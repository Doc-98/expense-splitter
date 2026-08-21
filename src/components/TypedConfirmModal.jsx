import { useState } from 'react'

// Generic "type the exact word to confirm" modal for the rare action that's
// both destructive and hard to walk back — a plain window.confirm() is too
// easy to blow through by habit for something like wiping a group's entire
// bill history, so this makes the confirm step deliberately slower: the
// confirm button stays disabled until what's typed matches confirmWord
// exactly (case-sensitive, no trimming — the point is a deliberate,
// accurate copy, not a loose match).
export default function TypedConfirmModal({
  title,
  body,
  confirmWord,
  confirmLabel,
  pending = false,
  onConfirm,
  onCancel,
}) {
  const [typed, setTyped] = useState('')
  const matches = typed.length > 0 && typed === confirmWord

  return (
    <div className="modal-backdrop" onClick={() => !pending && onCancel()}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {body}
        <p className="typed-confirm-prompt">
          Type <strong>{confirmWord}</strong> to confirm:
        </p>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={confirmWord}
          disabled={pending}
          autoFocus
        />
        <div className="modal-actions">
          <button type="button" className="btn-link" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button type="button" className="btn-danger" disabled={!matches || pending} onClick={onConfirm}>
            {pending ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
