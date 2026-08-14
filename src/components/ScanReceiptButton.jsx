import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { parseReceipt, currentStrategyLabel } from '../lib/receipt-parsing'

export default function ScanReceiptButton({ scanning, setScanning, onScanned, onError }) {
  const inputRef = useRef(null)
  const [progress, setProgress] = useState(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file next time
    if (!file) return

    setScanning(true)
    setProgress(null)
    onError(null)

    try {
      const base64 = await fileToBase64(file)
      const { items } = await parseReceipt(base64, file.type, (p) => setProgress(Math.round(p * 100)))
      if (!items?.length) {
        throw new Error('No items found on that receipt — try a clearer photo, or add items manually.')
      }
      onScanned(items)
    } catch (err) {
      onError(err.message || 'Could not read that receipt.')
    } finally {
      setScanning(false)
      setProgress(null)
    }
  }

  return (
    <div className="scan-row">
      <button
        type="button"
        className="btn-secondary"
        disabled={scanning}
        onClick={() => inputRef.current?.click()}
      >
        {scanning ? (progress !== null ? `Reading receipt… ${progress}%` : 'Reading receipt…') : 'Scan a receipt'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        style={{ display: 'none' }}
      />
      <p className="scan-strategy-note muted">
        Using: {currentStrategyLabel()} — <Link to="/scan-settings">change</Link>
      </p>
    </div>
  )
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
