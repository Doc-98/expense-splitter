import { preprocessPixels } from './imagePreprocess'

// Full-resolution phone photos (often 3000px+ on the long side) are
// overkill for OCR and just slow both this step and Tesseract itself down
// with no accuracy benefit — capping the longest side keeps things fast
// without losing legible detail on the text.
const MAX_DIMENSION = 2000

export function preprocessImageForOcr(imageBase64, mediaType) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        let { width, height } = img
        const longest = Math.max(width, height)
        if (longest > MAX_DIMENSION) {
          const scale = MAX_DIMENSION / longest
          width = Math.round(width * scale)
          height = Math.round(height * scale)
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)

        const imageData = ctx.getImageData(0, 0, width, height)
        imageData.data.set(preprocessPixels(imageData.data, width, height))
        ctx.putImageData(imageData, 0, 0)

        // PNG (lossless) rather than JPEG — no point re-introducing
        // compression artifacts on an image just cleaned up for OCR.
        const dataUrl = canvas.toDataURL('image/png')
        resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/png' })
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = () => reject(new Error('Could not load the image for preprocessing'))
    img.src = `data:${mediaType};base64,${imageBase64}`
  })
}
