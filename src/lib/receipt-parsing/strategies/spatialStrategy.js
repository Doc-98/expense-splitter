import { extractItemsFromLines } from '../lineParser'
import { getReceiptSettings } from '../../receiptSettings'

// Dynamically imported rather than a static import at the top of the file —
// this keeps Tesseract.js's JS wrapper out of the main bundle entirely for
// anyone who never uses this fallback (e.g. everyone who prefers Gemini),
// fetched only the moment it's actually needed.
export async function runSpatialOCR(imageBase64, mediaType, language, onProgress) {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(language || 'eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) onProgress(m.progress)
    },
  })
  try {
    const dataUrl = `data:${mediaType};base64,${imageBase64}`
    const { data } = await worker.recognize(dataUrl)

    // Tesseract already does its own line segmentation (data.lines), so
    // there's no need to reimplement Y-coordinate clustering here — this
    // just adapts that structure into the plain {text, x} shape
    // extractItemsFromLines expects, keeping the actual parsing heuristic
    // decoupled from Tesseract's specific API and independently testable.
    const lines = (data.lines || []).map((line) =>
      (line.words || []).map((w) => ({ text: w.text, x: w.bbox.x0 }))
    )

    return extractItemsFromLines(lines)
  } finally {
    await worker.terminate()
  }
}

export const spatialStrategy = {
  id: 'spatial',
  label: 'Free OCR (runs on this device, no account needed)',
  // Always available — this is the guaranteed fallback, nothing to configure.
  isConfigured: () => true,
  parse: (imageBase64, mediaType, onProgress) => {
    const { ocrLanguage } = getReceiptSettings()
    return runSpatialOCR(imageBase64, mediaType, ocrLanguage, onProgress)
  },
}
