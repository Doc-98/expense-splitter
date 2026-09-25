import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '../context/ThemeContext'
import { setStatsPreferences, getStatsPreferences } from './statsPreferences'
import { setReceiptSettings } from './receiptSettings'

// Browsers can refuse storage outright (blocked site data, some private
// modes, a full quota): every read and write then throws. None of that may
// break the app — least of all the theme, which is read before anything
// renders.
function blockStorage() {
  const refuse = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError')
  }
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(refuse)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(refuse)
}

afterEach(() => vi.restoreAllMocks())

describe('with storage blocked', () => {
  it('still renders the app (theme falls back to the system setting)', () => {
    window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
    blockStorage()
    render(
      <ThemeProvider>
        <p>App</p>
      </ThemeProvider>
    )
    expect(screen.getByText('App')).toBeInTheDocument()
  })

  it('still applies stats preferences and receipt settings, just without remembering them', () => {
    blockStorage()
    expect(setStatsPreferences({ defaultGranularity: 'year' }).defaultGranularity).toBe('year')
    expect(getStatsPreferences()).toBeTruthy()
    expect(() => setReceiptSettings({ strategy: 'gemini' })).not.toThrow()
  })
})
