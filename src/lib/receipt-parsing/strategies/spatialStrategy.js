import { extractItemsFromLines } from '../lineParser'
import { getReceiptSettings } from '../../receiptSettings'
import { preprocessImageForOcr } from '../preprocessImage'
import { mediaKindFor } from '../mediaKind'
import { extractPdfLines, hasSubstantialText, renderPdfPageToImage } from '../pdfText'

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
  // Short form for compact UI (the scan-method chip on a bill) — the full
  // label above stays as-is for prose contexts (ImportBankStatement.jsx's
  // sentences, Scan Settings' own row), where the parenthetical is exactly
  // what makes those readable on their own.
  shortLabel: 'Free OCR',
  // Which badge icon represents this strategy's category — matches the
  // provider picker in ScanSettingsSection.jsx (device/cloud/network),
  // reused here so the two stay visually in sync.
  badge: 'device',
  // Always available — this is the guaranteed fallback, nothing to configure.
  isConfigured: () => true,
  // categoryNames is deliberately unused — this reads pixels off the photo,
  // there's no language model behind it to ask "what category is this,"
  // same reasoning as its exclusion from the bill-categorization wizard's
  // own AI pass (see resolveClassifyStrategy() in billCategorization/index.js).
  // Items come back with no `category` field at all, same as before this
  // feature existed — plain undefined, nothing for the caller to resolve.
  parse: (imageBase64, mediaType, onProgress) => {
    const kind = mediaKindFor(mediaType)
    // A text/HTML export has no pixels and no positioned text runs either
    // (base64ToText's flat string has no x/y to sort by) — nothing this
    // strategy's line-position heuristic can work with.
    if (kind === 'text') {
      throw new Error(
        'Free OCR can only read a photo or a PDF, not a plain text/HTML file — take a photo instead, or add a Claude/Gemini API key in Scan settings to read documents directly.'
      )
    }
    if (kind === 'document') {
      return parsePdf(imageBase64, onProgress)
    }
    const { ocrLanguage } = getReceiptSettings()
    return runSpatialOCR(imageBase64, mediaType, ocrLanguage, onProgress)
  },
}

// Most PDFs anyone actually has are a digital export (an emailed receipt,
// an invoice) with real, positioned text already in them — pulled out
// directly here, no OCR involved at all, and more accurate than OCR could
// ever be since there's no misread-character risk. Only when a PDF turns
// out to have no real text layer (i.e. it's actually a scanned photo saved
// as a PDF) does this fall back to rendering its first page to an image
// and reading that the same way a photo would be.
async function parsePdf(imageBase64, onProgress) {
  const lines = await extractPdfLines(imageBase64)
  if (hasSubstantialText(lines)) {
    return extractItemsFromLines(lines)
  }
  const { ocrLanguage } = getReceiptSettings()
  const rendered = await renderPdfPageToImage(imageBase64)
  return runSpatialOCR(rendered.base64, rendered.mediaType, ocrLanguage, onProgress)
}
