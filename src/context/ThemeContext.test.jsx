import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render } from '@testing-library/react'
import { ThemeProvider, useTheme } from './ThemeContext'

// The browser/status bar colour comes from styles.css's --browser-bar for
// the theme actually shown; a stand-in stylesheet with the same shape.
const BAR_CSS = ':root { --browser-bar: #2A6253; } [data-theme="dark"] { --browser-bar: #111C17; }'

let style
let metas
let setMode
function Grab() {
  setMode = useTheme().setMode
  return null
}

beforeEach(() => {
  localStorage.clear()
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  style = document.createElement('style')
  style.textContent = BAR_CSS
  document.head.append(style)
  metas = ['(prefers-color-scheme: light)', '(prefers-color-scheme: dark)'].map((media, i) => {
    const m = document.createElement('meta')
    m.name = 'theme-color'
    m.media = media
    m.content = i ? '#111C17' : '#2A6253'
    document.head.append(m)
    return m
  })
})

afterEach(() => {
  style.remove()
  metas.forEach((m) => m.remove())
  document.documentElement.removeAttribute('data-theme')
})

describe('browser bar colour', () => {
  it('follows the theme shown, whatever the OS prefers', () => {
    render(
      <ThemeProvider>
        <Grab />
      </ThemeProvider>,
    )
    // OS is light (matchMedia false) and nothing is stored: light theme, green bar
    expect(metas.map((m) => m.content)).toEqual(['#2A6253', '#2A6253'])

    // An explicit Dark in Settings wins over the light OS
    act(() => setMode('dark'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(metas.map((m) => m.content)).toEqual(['#111C17', '#111C17'])

    act(() => setMode('light'))
    expect(metas.map((m) => m.content)).toEqual(['#2A6253', '#2A6253'])
  })
})
