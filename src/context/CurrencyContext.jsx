import { createContext, useContext, useState } from 'react'

const CurrencyContext = createContext(null)

const STORAGE_KEY = 'spesa-currency'
const DEFAULT_CODE = 'EUR'

// A curated set of major currencies, not the full ISO 4217 list — this is
// a display preference (which symbol to show), not real multi-currency
// support with conversion, so there's no benefit to an exhaustive list
// nobody asked for.
export const CURRENCIES = [
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'USD', symbol: '$', label: 'US Dollar' },
  { code: 'GBP', symbol: '£', label: 'British Pound' },
  { code: 'CHF', symbol: 'Fr.', label: 'Swiss Franc' },
  { code: 'JPY', symbol: '¥', label: 'Japanese Yen' },
  { code: 'CAD', symbol: 'CA$', label: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', label: 'Australian Dollar' },
]

function readStoredCode() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return CURRENCIES.some((c) => c.code === stored) ? stored : DEFAULT_CODE
  } catch {
    return DEFAULT_CODE
  }
}

export function CurrencyProvider({ children }) {
  const [code, setCode] = useState(readStoredCode)

  function setCurrency(newCode) {
    setCode(newCode)
    try {
      localStorage.setItem(STORAGE_KEY, newCode)
    } catch {
      // best-effort persistence, same as every other local setting in this app
    }
  }

  const symbol = CURRENCIES.find((c) => c.code === code)?.symbol || '€'

  return (
    <CurrencyContext.Provider value={{ code, symbol, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  )
}

// Every call site formats money through this rather than concatenating
// the symbol by hand — one place to get right, and it means a sweep like
// this one is a search-and-replace of the *call*, not of formatting logic
// scattered across a dozen files.
export function useCurrency() {
  const ctx = useContext(CurrencyContext)
  return {
    ...ctx,
    format: (amount) => `${ctx.symbol}${(Number(amount) || 0).toFixed(2)}`,
  }
}
