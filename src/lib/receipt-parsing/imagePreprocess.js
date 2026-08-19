// Turns a photo into a clean black-text-on-white-background image before
// handing it to Tesseract — this is what a proper document scanner app
// does under the hood, and it's the single highest-leverage thing available
// for improving free OCR accuracy, well ahead of things like a generic
// sharpen filter. A phone photo of a receipt usually has uneven lighting
// (a shadow, an angled light source), so a single global brightness cutoff
// tends to lose text in the darker half of the image — this uses a
// *local* threshold instead (Bradley's method, via an integral image so
// it's still fast), comparing each pixel to the average brightness of the
// area immediately around it rather than the whole photo at once.

export function toGrayscale(rgba) {
  const length = rgba.length / 4
  const gray = new Float64Array(length)
  for (let i = 0; i < length; i++) {
    const r = rgba[i * 4]
    const g = rgba[i * 4 + 1]
    const b = rgba[i * 4 + 2]
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b
  }
  return gray
}

// windowRatio: how big the local neighborhood is, as a fraction of the
// image's longest side. sensitivity: how much darker than the local
// average a pixel needs to be to count as "text" (ink is rarely subtle).
export function adaptiveThreshold(gray, width, height, { windowRatio = 0.125, sensitivity = 0.15 } = {}) {
  const windowSize = Math.max(1, Math.round(Math.max(width, height) * windowRatio))
  const halfWindow = windowSize >> 1

  // Integral image (summed-area table), one extra row/col of zero padding
  // so every real pixel's window sum can be read with no edge-case branches.
  const stride = width + 1
  const integral = new Float64Array(stride * (height + 1))
  for (let y = 0; y < height; y++) {
    let rowSum = 0
    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x]
      integral[(y + 1) * stride + (x + 1)] = integral[y * stride + (x + 1)] + rowSum
    }
  }

  const windowSum = (x0, y0, x1, y1) =>
    integral[y1 * stride + x1] - integral[y0 * stride + x1] - integral[y1 * stride + x0] + integral[y0 * stride + x0]

  const output = new Uint8ClampedArray(width * height)
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - halfWindow)
    const y1 = Math.min(height, y + halfWindow + 1)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - halfWindow)
      const x1 = Math.min(width, x + halfWindow + 1)
      const count = (x1 - x0) * (y1 - y0)
      const mean = windowSum(x0, y0, x1, y1) / count
      const pixel = gray[y * width + x]
      output[y * width + x] = pixel < mean * (1 - sensitivity) ? 0 : 255
    }
  }

  return output
}

// Full pipeline: RGBA in, RGBA out (still RGBA so it drops straight back
// into a canvas — grayscale value replicated across R/G/B, alpha untouched).
export function preprocessPixels(rgba, width, height, options) {
  const gray = toGrayscale(rgba)
  const binarized = adaptiveThreshold(gray, width, height, options)
  const output = new Uint8ClampedArray(rgba.length)
  for (let i = 0; i < binarized.length; i++) {
    output[i * 4] = binarized[i]
    output[i * 4 + 1] = binarized[i]
    output[i * 4 + 2] = binarized[i]
    output[i * 4 + 3] = 255
  }
  return output
}
