import { extractItemsFromLines } from '../lineParser'
import { getReceiptSettings } from '../../receiptSettings'
import { preprocessImageForOcr } from '../preprocessImage'

// Tesseract's actual nested shape is blocks[].paragraphs[].lines[].words[]
// — there's no flat data.lines. Block-level output also has to be
// explicitly requested (see the {blocks: true} argument below); by default
// Tesseract.js only returns plain text, to avoid the overhead of building
// the full layout tree when nobody asked for it.
function collectLines(page) {
  const lines = []
  for (const block of page.blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) {
        lines.push(line)
      }
    }
  }
  return lines
}

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
    // Cleans up lighting/contrast before OCR sees the photo at all — falls
    // back to the untouched original if preprocessing itself has a
    // problem, rather than losing the scan over it.
    let processedBase64 = imageBase64
    let processedMediaType = mediaType
    try {
      const processed = await preprocessImageForOcr(imageBase64, mediaType)
      processedBase64 = processed.base64
      processedMediaType = processed.mediaType
    } catch {
      // fall through with the original image
    }

    const dataUrl = `data:${processedMediaType};base64,${processedBase64}`
    const { data } = await worker.recognize(dataUrl, {}, { blocks: true })

    // This just adapts Tesseract's structure into the plain {text, x} shape
    // extractItemsFromLines expects, keeping the actual parsing heuristic
    // decoupled from Tesseract's specific API and independently testable.
    const lines = collectLines(data).map((line) =>
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
  // categoryNames is deliberately unused — this reads pixels off the photo,
  // there's no language model behind it to ask "what category is this,"
  // same reasoning as its exclusion from the bill-categorization wizard's
  // own AI pass (see resolveClassifyStrategy() in billCategorization/index.js).
  // Items come back with no `category` field at all, same as before this
  // feature existed — plain undefined, nothing for the caller to resolve.
  parse: (imageBase64, mediaType, onProgress) => {
    const { ocrLanguage } = getReceiptSettings()
    return runSpatialOCR(imageBase64, mediaType, ocrLanguage, onProgress)
  },
}
