// @vitest-environment node
// Guards the contrast rules stated in src/styles/tokens.css (and in the
// design system's brand book), in both themes, reading the colours straight
// from the stylesheet so a changed token can't slip past:
//   - every text colour is ≥ 7:1 (WCAG AAA) on every ground it can land on
//   - labels on accent/warn fills are ≥ 7:1
//   - field/control outlines (--border-strong), and the accent used as focus
//     ring and bar fill, are ≥ 3:1; the quiet --border stays ≥ 1.5:1
//   - category colours (both palettes) are ≥ 3:1 as marks
//   - every text colour in the print styles is ≥ 7:1 on paper white
import { describe, it, expect } from 'vitest'
import { readStylesheet } from '../testing/readStylesheet'

const css = readStylesheet().replace(/\/\*[\s\S]*?\*\//g, '')

// Top-level `selector { body }` rules, braces matched so @media bodies stay whole.
function rules(src) {
  const out = []
  let depth = 0
  let start = 0
  let open = 0
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '{') {
      if (depth === 0) open = i
      depth++
    } else if (src[i] === '}') {
      depth--
      if (depth === 0) {
        out.push({ selector: src.slice(start, open).trim(), body: src.slice(open + 1, i) })
        start = i + 1
      }
    } else if (depth === 0 && src[i] === ';') {
      start = i + 1 // skip top-level @import etc.
    }
  }
  return out
}

const top = rules(css)
// Every hex custom property declared in rules with exactly this selector, later ones winning.
function vars(selector) {
  const v = {}
  for (const r of top.filter((r) => r.selector === selector)) {
    for (const [, name, hex] of r.body.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})\b/g)) v[name] = hex
  }
  return v
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const light = vars(':root')
const themes = {
  light,
  dark: { ...light, ...vars('[data-theme="dark"]') },
}
const palettes = {
  light: { default: themes.light, colorblind: { ...themes.light, ...vars(':root[data-palette="colorblind"]') } },
  dark: {
    default: themes.dark,
    colorblind: { ...themes.dark, ...vars('[data-theme="dark"][data-palette="colorblind"]') },
  },
}

const GROUNDS = ['bg', 'surface', 'surface-tint', 'accent-light']
const TEXT = ['ink', 'ink-soft', 'accent-dark', 'negative', 'warn']

// [label, foreground token, ground token, minimum ratio] for one theme
function pairs() {
  const p = []
  for (const fg of TEXT) for (const bg of GROUNDS) p.push([`${fg} text on ${bg}`, fg, bg, 7])
  p.push(['warn text on warn-light (error messages)', 'warn', 'warn-light', 7])
  p.push(['on-accent label on accent', 'on-accent', 'accent', 7])
  p.push(['on-warn label on warn', 'on-warn', 'warn', 7])
  for (const bg of GROUNDS) p.push([`border-strong (field and control outlines) on ${bg}`, 'border-strong', bg, 3])
  for (const bg of GROUNDS) p.push([`border (quiet row/card outline) on ${bg}, still visible`, 'border', bg, 1.5])
  for (const bg of GROUNDS) p.push([`accent (focus ring, bar fill) on ${bg}`, 'accent', bg, 4.5])
  for (const bg of ['bg', 'surface', 'surface-tint', 'accent-light'])
    p.push([`negative (over-budget fill) on ${bg}`, 'negative', bg, 3])
  return p
}

describe.each(Object.entries(themes))('%s theme contrast', (name, t) => {
  it('reads every token it checks from styles.css', () => {
    for (const token of [...TEXT, ...GROUNDS, 'warn-light', 'on-accent', 'on-warn', 'border', 'border-strong', 'accent'])
      expect(t[token], `--${token} in the ${name} theme`).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it.each(pairs())('%s', (label, fg, bg, min) => {
    const ratio = contrast(t[fg], t[bg])
    expect(ratio, `${label}: ${t[fg]} on ${t[bg]} is ${ratio.toFixed(2)}:1, needs ${min}:1`).toBeGreaterThanOrEqual(min)
  })
})

describe.each(['light', 'dark'])('%s theme category colours', (theme) => {
  it.each(['default', 'colorblind'])('%s palette: every slot is ≥ 3:1 on bg, surface and surface-tint', (palette) => {
    const t = palettes[theme][palette]
    for (let n = 1; n <= 7; n++) {
      const c = t[`category-${n}`]
      expect(c, `--category-${n}`).toMatch(/^#[0-9A-Fa-f]{6}$/)
      for (const bg of ['bg', 'surface', 'surface-tint']) {
        const ratio = contrast(c, t[bg])
        expect(ratio, `category-${n} ${c} on ${bg} ${t[bg]}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
      }
    }
  })
})

describe('print styles', () => {
  const print = top.find((r) => r.selector === '@media print')
  const colors = [...print.body.matchAll(/(?<![-\w])color:\s*(#[0-9A-Fa-f]{3,6})\b/g)].map((m) => m[1])
  const full = (h) => (h.length === 4 ? '#' + [...h.slice(1)].map((c) => c + c).join('') : h)

  it('has text colours to check', () => {
    expect(colors.length).toBeGreaterThan(0)
  })

  it.each(colors)('text colour %s is ≥ 7:1 on paper white', (c) => {
    const ratio = contrast(full(c), '#FFFFFF')
    expect(ratio, `${c} on white is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(7)
  })
})
