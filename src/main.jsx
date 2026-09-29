import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts.css'
import './styles.css'
import App from './App.jsx'
import { applyColorBlindPalette, getColorBlindPalette } from './lib/colorBlindPalette'

// Before the first render, so a colour-blind-palette device never flashes
// the default category colours first.
applyColorBlindPalette(getColorBlindPalette())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
