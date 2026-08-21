import { useRef, useState } from 'react'
import { shareOrCopyText } from '../lib/shareText'
import { useClickOutside } from '../lib/useClickOutside'

// One button standing in for what used to be two side by side ("Share
// recap" / "Download PDF") — opens a small menu with both options instead,
// same pattern InviteMenu already uses for its own button-that-opens-a-menu.
// PDF export still goes through the browser's print dialog (see the
// .print-only element the caller renders alongside this), so this
// component only needs to trigger window.print() — it has no idea which
// printable recap actually exists on the page.
export default function ShareButton({ getText, title, label = 'Share' }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(null)
  const wrapRef = useRef(null)

  useClickOutside(wrapRef, () => setOpen(false), open)

  async function shareAsText() {
    setOpen(false)
    const result = await shareOrCopyText(getText(), title)
    if (result === 'copied') {
      setStatus('Copied to clipboard!')
      setTimeout(() => setStatus(null), 2000)
    }
  }

  function downloadAsPdf() {
    setOpen(false)
    window.print()
  }

  return (
    <div className="share-button-wrap" ref={wrapRef}>
      <button type="button" className="btn-secondary" onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && (
        <div className="share-menu-popover">
          <button type="button" className="dropdown-item" onClick={shareAsText}>
            Share as text
          </button>
          <button type="button" className="dropdown-item" onClick={downloadAsPdf}>
            Download as PDF
          </button>
        </div>
      )}
      {status && <span className="muted share-status">{status}</span>}
    </div>
  )
}
