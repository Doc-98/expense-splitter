import { useState } from 'react'
import { shareOrCopyText } from '../lib/shareText'

export default function ShareButton({ getText, title, label = 'Share' }) {
  const [status, setStatus] = useState(null)

  async function handleClick() {
    const result = await shareOrCopyText(getText(), title)
    if (result === 'copied') {
      setStatus('Copied to clipboard!')
      setTimeout(() => setStatus(null), 2000)
    }
  }

  return (
    <div className="share-button-wrap">
      <button type="button" className="btn-secondary" onClick={handleClick}>
        {label}
      </button>
      {status && <span className="muted share-status">{status}</span>}
    </div>
  )
}
