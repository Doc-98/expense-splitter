import { useRef } from 'react'
import { supabase } from '../supabaseClient'

export default function ScanReceiptButton({ scanning, setScanning, onScanned, onError }) {
  const inputRef = useRef(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file next time
    if (!file) return

    setScanning(true)
    onError(null)

    try {
      const base64 = await fileToBase64(file)
      const { data, error } = await supabase.functions.invoke('parse-receipt', {
        body: { image: base64, mediaType: file.type },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      if (!data?.items?.length) {
        throw new Error('No items found on that receipt — try a clearer photo, or add items manually.')
      }
      onScanned(data.items)
    } catch (err) {
      setScanning(false)
      onError(err.message || 'Could not read that receipt.')
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
        {scanning ? 'Reading receipt…' : 'Scan a receipt'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        style={{ display: 'none' }}
      />
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
