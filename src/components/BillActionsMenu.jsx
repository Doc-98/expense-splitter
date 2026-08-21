import { useRef, useState } from 'react'
import { useClickOutside } from '../lib/useClickOutside'

// The three-dot button on each bill row — a small popover with the actions
// that used to be (or, for Select, could only be) reached elsewhere.
// "Select" doesn't check a box here — there isn't one, this row isn't in
// selection mode — it hands off to the caller's onSelect, which is expected
// to turn selection mode on with this one bill already picked, landing in
// the exact state a person would be in if they'd hit the list's own
// "Select" toggle and then ticked this row themselves.
export default function BillActionsMenu({ billTitle, onSelect, onShare, onDelete }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  useClickOutside(wrapRef, () => setOpen(false), open)

  function run(action) {
    setOpen(false)
    action()
  }

  return (
    <div className="bill-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className="bill-menu-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Actions for ${billTitle}`}
      >
        ⋮
      </button>
      {open && (
        <div className="bill-menu-popover">
          <button type="button" className="dropdown-item" onClick={() => run(onSelect)}>
            Select
          </button>
          <button type="button" className="dropdown-item" onClick={() => run(onShare)}>
            Share
          </button>
          <button type="button" className="dropdown-item dropdown-item-warn" onClick={() => run(onDelete)}>
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
