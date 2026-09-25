// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { mediaKindFor, base64ToText } from './mediaKind'

describe('mediaKindFor', () => {
  it('treats any image/* type as a photo', () => {
    expect(mediaKindFor('image/jpeg')).toBe('image')
    expect(mediaKindFor('image/png')).toBe('image')
    expect(mediaKindFor('image/heic')).toBe('image')
  })

  it('treats application/pdf as a document', () => {
    expect(mediaKindFor('application/pdf')).toBe('document')
  })

  it('treats any text/* type as text', () => {
    expect(mediaKindFor('text/plain')).toBe('text')
    expect(mediaKindFor('text/html')).toBe('text')
  })

  it('falls back to image for anything unrecognized', () => {
    expect(mediaKindFor('application/octet-stream')).toBe('image')
    expect(mediaKindFor(undefined)).toBe('image')
  })
})

describe('base64ToText', () => {
  it('round-trips plain ASCII', () => {
    expect(base64ToText(btoa('Total: 12.50'))).toBe('Total: 12.50')
  })

  it('round-trips UTF-8 text correctly, not as mojibake', () => {
    const text = 'Panetteria — pane €2,50'
    const bytes = new TextEncoder().encode(text)
    const base64 = btoa(String.fromCharCode(...bytes))
    expect(base64ToText(base64)).toBe(text)
  })
})
