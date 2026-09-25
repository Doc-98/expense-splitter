import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)
const STORAGE_KEY = 'spesa-theme'

// The stored preference itself — 'light'/'dark' pin it, 'system' (the
// default for anyone who's never touched this) means "whatever the OS
// says, live." Falls back to 'system' for anything unrecognized (a
// pre-this-feature 'light'/'dark' string from localStorage is still valid
// as-is, so an existing explicit choice survives this change untouched).
// Storage access can throw (blocked site data, some private modes) — and
// this runs before anything renders, so an uncaught throw here would leave
// the whole app blank.
function getStoredMode() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

// Settings > Layout's own "Appearance" picker sets `mode` (light/dark/
// system); `theme` is always the *resolved* light/dark value actually
// painted (data-theme on <html> — see styles.css's [data-theme="dark"]
// block, the only place either color scheme is ever defined). Consumers
// that only care what's on screen right now (there are none left outside
// this file today, but the distinction is why both exist) read `theme`;
// the picker itself reads/writes `mode`.
export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(getStoredMode)
  const [theme, setTheme] = useState(() => (mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode))

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // Not remembered for next time; still applied now.
    }
    if (mode !== 'system') {
      setTheme(mode)
      return
    }
    // 'system' isn't a one-time read at mount — it keeps tracking the OS
    // setting live for as long as it's selected, same as any other app's
    // "Match system" would. A plain useState initializer alone (the old
    // getInitialTheme this replaces) only ever looked once, at first load.
    setTheme(systemPrefersDark() ? 'dark' : 'light')
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e) => setTheme(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return <ThemeContext.Provider value={{ mode, theme, setMode }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
