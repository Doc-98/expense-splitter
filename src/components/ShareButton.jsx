import { useRef, useState } from 'react'
import { shareOrCopyText } from '../lib/shareText'
import { useClickOutside } from '../lib/useClickOutside'
import { ShareIcon } from './icons'

// One button standing in for what used to be up to three side by side
// ("Share recap" / "Download PDF" / "Export CSV") — opens a small menu
// with whichever of those actually apply here, same pattern InviteMenu
// already uses for its own button-that-opens-a-menu. PDF export still goes
// through the browser's print dialog (see the .print-only element the
// caller renders alongside this), so this component only needs to trigger
// window.print() — it has no idea which printable recap actually exists on
// the page. "Share as text"/"Download as PDF" only show when `getText` is
// given — a caller offering CSV export alone (nothing to share as text, no
// printable recap rendered) passes `onExportCsv` without `getText` and
// gets a CSV-only menu instead of two dead items.
export default function ShareButton({
  getText,
  title,
  label = 'Share',
  onExportCsv,
  csvLabel = 'Export as CSV',
  icon = false,
  menuAlign = 'left',
}) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(null)
  const wrapRef = useRef(null)

  useClickOutside(wrapRef, () => setOpen(false), open)

  async function shareAsText() {
    setOpen(false)
    const result = await shareOrCopyText(getText(), title)
    if (result === 'copied' || result === 'failed') {
      setStatus(result === 'copied' ? 'Copied to clipboard!' : "Couldn't share or copy this — your browser blocked it.")
      setTimeout(() => setStatus(null), result === 'copied' ? 2000 : 4000)
    }
  }

  function downloadAsPdf() {
    setOpen(false)
    window.print()
  }

  function exportCsv() {
    setOpen(false)
    onExportCsv()
  }

  return (
    <div className={`share-button-wrap ${icon ? 'share-button-wrap-icon' : ''}`} ref={wrapRef}>
      <button
        type="button"
        className={icon ? 'icon-btn' : 'btn-secondary'}
        onClick={() => setOpen((o) => !o)}
        aria-label={icon ? label : undefined}
        title={icon ? label : undefined}
      >
        {icon ? <ShareIcon /> : label}
      </button>
      {open && (
        <div className={`share-menu-popover ${menuAlign === 'right' ? 'share-menu-popover-right' : ''}`}>
          {getText && (
            <button type="button" className="dropdown-item" onClick={shareAsText}>
              Share as text
            </button>
          )}
          {getText && (
            <button type="button" className="dropdown-item" onClick={downloadAsPdf}>
              Download as PDF
            </button>
          )}
          {onExportCsv && (
            <button type="button" className="dropdown-item" onClick={exportCsv}>
              {csvLabel}
            </button>
          )}
        </div>
      )}
      {/* Absolutely positioned in icon mode — a header packed tight with
          three icon buttons has no spare inline room for this without
          shoving Settings/Stats around every time it briefly appears. */}
      {status && <span className={`muted share-status ${icon ? 'share-status-icon' : ''}`}>{status}</span>}
    </div>
  )
}
