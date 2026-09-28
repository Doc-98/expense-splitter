// Settings > Layout's "Color-blind friendly category colors" switch — a
// per-device display preference, like the theme: stored in localStorage
// only, never on the account. Turning it on sets data-palette="colorblind"
// on <html>, which swaps styles.css's --category-1…7 to the colour-blind
// steps; every category colour painted through categoryColor() follows
// without a re-render. Custom category colours aren't affected (there's
// nothing reliable to map an arbitrary colour to).
const STORAGE_KEY = 'spesa-colorblind-palette'

// Storage access can throw (blocked site data, some private modes) — and
// this runs before anything renders, so it has to fail quietly to "off".
export function getColorBlindPalette() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

export function applyColorBlindPalette(on) {
  if (on) document.documentElement.setAttribute('data-palette', 'colorblind')
  else document.documentElement.removeAttribute('data-palette')
}

export function setColorBlindPalette(on) {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, 'on')
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Not remembered for next time; still applied now.
  }
  applyColorBlindPalette(on)
  return on
}
