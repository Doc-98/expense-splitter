// Everything Free OCR (spatialStrategy.js) needs to handle a PDF without
// AI: pull the PDF's own text layer straight out (most receipts/invoices
// people actually have are digital exports, not scans — they already have
// real, selectable text, positioned exactly), or — only when a PDF turns
// out to have no text layer at all, i.e. it's actually a scanned photo
// saved as a PDF — render its first page to an image so the existing
// image-OCR path (runSpatialOCR) can read it the same way it reads a photo.
//
// pdfjs-dist is dynamically imported, same reasoning as tesseract.js in
// spatialStrategy.js: this keeps a fairly large library out of the main
// bundle for everyone who never scans a PDF at all.
async function loadPdfjs() {
  const pdfjsLib = await import('pdfjs-dist')
  // Needs its own worker script to parse in a background thread — without
  // this, pdf.js still works, but silently falls back to a slower
  // main-thread "fake worker" with a console warning every time. The `?url`
  // import hands Vite the built, content-hashed URL for that worker file
  // rather than trying to inline or bundle it as a normal module.
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
  return pdfjsLib
}

// Only the first page — a receipt or invoice saved as a PDF is essentially
// always one page; a multi-page statement would need a different feature
// entirely (see ImportBankStatement.jsx), not a bigger version of this one.
async function loadFirstPage(base64) {
  const pdfjsLib = await loadPdfjs()
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const doc = await pdfjsLib.getDocument({ data: bytes }).promise
  return doc.getPage(1)
}

// Groups a PDF page's text runs into the same {text, x} line shape
// lineParser.js's extractItemsFromLines() already expects from Tesseract —
// so once a page's words are grouped this way, it's the exact same
// item-extraction logic either way, not a second parser to maintain.
//
// PDF coordinates grow upward (y=0 is the bottom of the page), so the
// highest y is the top line, printed first — lines come back in that
// top-to-bottom reading order. Runs on the same line don't always share
// the exact same y down to the last decimal (sub-pixel baseline
// differences between glyphs), so this buckets by y rounded to the
// nearest whole point rather than requiring an exact match.
export async function extractPdfLines(base64) {
  const page = await loadFirstPage(base64)
  const content = await page.getTextContent()

  const byY = new Map()
  for (const item of content.items) {
    const text = item.str
    if (!text || !text.trim()) continue // pdf.js also emits blank/spacer runs
    const [, , , , x, y] = item.transform
    const key = Math.round(y)
    if (!byY.has(key)) byY.set(key, [])
    byY.get(key).push({ text: text.trim(), x })
  }

  const ys = [...byY.keys()].sort((a, b) => b - a)
  return ys.map((y) => byY.get(y))
}

// Whether a PDF actually has real text to read, or is just a photo/scan
// that happens to be wrapped in a PDF container — a handful of stray
// characters (a watermark, a page number) shouldn't count as "has text,"
// so this checks for a receipt-sized amount of it, not just >0.
export function hasSubstantialText(lines) {
  const totalChars = lines.reduce((sum, words) => sum + words.reduce((s, w) => s + w.text.length, 0), 0)
  return totalChars >= 20
}

// The fallback for a scanned PDF: same idea as preprocessImage.js's own
// MAX_DIMENSION cap, aimed at a resolution that's sharp enough for
// Tesseract without rendering something absurdly large — a PDF page's
// default coordinate space is 72 units per inch, so scaling by ~2.8x lands
// a normal receipt-width page in the same few-thousand-pixel range a phone
// photo would already be.
const TARGET_LONG_SIDE = 2000

export async function renderPdfPageToImage(base64) {
  const page = await loadFirstPage(base64)
  const unscaledViewport = page.getViewport({ scale: 1 })
  const longest = Math.max(unscaledViewport.width, unscaledViewport.height)
  const scale = Math.min(4, TARGET_LONG_SIDE / longest)
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport }).promise

  const dataUrl = canvas.toDataURL('image/png')
  return { base64: dataUrl.split(',')[1], mediaType: 'image/png' }
}
