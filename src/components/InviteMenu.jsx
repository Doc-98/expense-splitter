import { useRef, useState } from 'react'
import { shareOrCopyText } from '../lib/shareText'
import { useClickOutside } from '../lib/useClickOutside'

export default function InviteMenu({ inviteUrl, groupName }) {
  const [open, setOpen] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [status, setStatus] = useState(null)
  const wrapRef = useRef(null)

  useClickOutside(wrapRef, () => setOpen(false), open)

  async function toggleOpen() {
    const next = !open
    setOpen(next)
    // Generated lazily, on first open, and cached — no point building a QR
    // code for an invite menu nobody opens this session.
    if (next && !qrDataUrl) {
      // Loaded on demand, so it can fail offline (or after a new version
      // replaced the file) — the menu still opens with the Share button,
      // just without the QR code.
      try {
        const QRCode = await import('qrcode')
        setQrDataUrl(await QRCode.toDataURL(inviteUrl, { width: 220, margin: 1 }))
      } catch {
        setStatus("Couldn't load the QR code — the Share button still works.")
      }
    }
  }

  async function share() {
    const result = await shareOrCopyText(inviteUrl, `Join ${groupName} on Spesa`)
    if (result === 'copied' || result === 'failed') {
      setStatus(result === 'copied' ? 'Copied to clipboard!' : "Couldn't share or copy the link — your browser blocked it.")
      setTimeout(() => setStatus(null), result === 'copied' ? 2000 : 4000)
    }
  }

  return (
    <div className="invite-menu-wrap" ref={wrapRef}>
      <button type="button" className="btn-secondary" onClick={toggleOpen}>
        Invite
      </button>
      {open && (
        <div className="invite-menu-popover">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR code to join this group" className="invite-qr" />
          ) : (
            <p className="muted">Generating QR code…</p>
          )}
          <p className="muted invite-hint">Scan to join, or:</p>
          <button type="button" className="btn-secondary" onClick={share}>
            Share invite link
          </button>
          {status && <p className="muted share-status">{status}</p>}
        </div>
      )}
    </div>
  )
}
