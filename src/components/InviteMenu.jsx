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
      const QRCode = await import('qrcode')
      const dataUrl = await QRCode.toDataURL(inviteUrl, { width: 220, margin: 1 })
      setQrDataUrl(dataUrl)
    }
  }

  async function share() {
    const result = await shareOrCopyText(inviteUrl, `Join ${groupName} on Spesa`)
    if (result === 'copied') {
      setStatus('Copied to clipboard!')
      setTimeout(() => setStatus(null), 2000)
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
