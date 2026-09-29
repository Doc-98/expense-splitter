import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getColorBlindPalette, setColorBlindPalette, applyColorBlindPalette } from './colorBlindPalette'

describe('color-blind palette preference', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-palette')
    vi.restoreAllMocks()
  })

  it('is off by default', () => {
    expect(getColorBlindPalette()).toBe(false)
  })

  it('turning it on is remembered and applied to <html>', () => {
    expect(setColorBlindPalette(true)).toBe(true)
    expect(getColorBlindPalette()).toBe(true)
    expect(document.documentElement.getAttribute('data-palette')).toBe('colorblind')
  })

  it('turning it off forgets it and removes the attribute', () => {
    setColorBlindPalette(true)
    setColorBlindPalette(false)
    expect(getColorBlindPalette()).toBe(false)
    expect(document.documentElement.hasAttribute('data-palette')).toBe(false)
  })

  it('applyColorBlindPalette only touches the page, not storage', () => {
    applyColorBlindPalette(true)
    expect(document.documentElement.getAttribute('data-palette')).toBe('colorblind')
    expect(getColorBlindPalette()).toBe(false)
  })

  it('falls back to off, and still applies a change, when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(getColorBlindPalette()).toBe(false)
    expect(setColorBlindPalette(true)).toBe(true)
    expect(document.documentElement.getAttribute('data-palette')).toBe('colorblind')
  })
})
