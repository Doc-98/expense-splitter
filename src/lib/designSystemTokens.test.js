// @vitest-environment node
// Keeps the design system's tokens (docs/design-system/tokens.json, the
// same file as the Spesa design system artifact's) in step with the app's
// own, src/styles/tokens.css, which is the source of truth. Every token in
// either must be in the other with the same value, in both themes and both
// category palettes, so a change made on one side only fails here instead
// of quietly leaving the documentation wrong. See docs/design-system/README.md,
// "Where this lives".
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

const tokensCss = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const tokensJson = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/design-system/tokens.json'), 'utf8'))

// Every custom property declared in top-level rules with exactly this selector.
function declared(selector) {
  const out = {}
  for (const [, sel, body] of tokensCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (sel.trim() !== selector) continue
    for (const [, name, value] of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[name] = value.trim()
  }
  return out
}

// One spelling for comparing: case and spaces don't matter ("#FAF9F6" is
// "#faf9f6", "rgba(0, 0, 0, 0.5)" is "rgba(0,0,0,0.5)").
const norm = (v) => String(v).toLowerCase().replace(/\s+/g, '')

const light = { ...declared(':root'), ...declared(':root[data-palette="colorblind"]') }
const dark = { ...declared('[data-theme="dark"]'), ...declared('[data-theme="dark"][data-palette="colorblind"]') }
// The colour-blind steps live in their own blocks, under their own names in tokens.json.
const cbLight = declared(':root[data-palette="colorblind"]')
const cbDark = declared('[data-theme="dark"][data-palette="colorblind"]')
const defaultCategories = (theme) =>
  Object.fromEntries(Object.entries(declared(theme === 'light' ? ':root' : '[data-theme="dark"]')).filter(([n]) => n.startsWith('category-')))

// The CSS value a tokens.json colour token names, in one theme.
function cssColour(name, theme) {
  const cb = name.match(/^category-cb-(\d)$/)
  if (cb) return (theme === 'light' ? cbLight : cbDark)[`category-${cb[1]}`]
  if (name.startsWith('category-')) return defaultCategories(theme)[name]
  return theme === 'light' ? light[name] : (dark[name] ?? light[name])
}

// Colours and shadows vary by theme; spacing, radius, type and stacking don't.
const themed = [...tokensJson.color.tokens, ...tokensJson.shadow.tokens]
const flat = [...tokensJson.spacing.tokens, ...tokensJson.radius.tokens, ...tokensJson.text.tokens, ...tokensJson.zIndex.tokens]

describe('design system tokens match the app', () => {
  for (const { name, value } of themed) {
    for (const theme of ['light', 'dark']) {
      it(`${name} (${theme})`, () => {
        const documented = typeof value === 'string' ? value : value[theme] ?? value.light
        expect(norm(cssColour(name, theme)), `--${name} in tokens.css`).toBe(norm(documented))
      })
    }
  }

  for (const { name, value } of flat) {
    it(name, () => {
      expect(norm(light[name]), `--${name} in tokens.css`).toBe(norm(value))
    })
  }

  it('font families', () => {
    for (const [family, stack] of Object.entries(tokensJson.type.families)) {
      expect(norm(light[`font-${family}`]), `--font-${family}`).toBe(norm(stack))
    }
  })

  it('every token in tokens.css is documented in tokens.json', () => {
    const documented = new Set([
      ...themed.map((t) => t.name),
      ...flat.map((t) => t.name),
      ...Object.keys(tokensJson.type.families).map((f) => `font-${f}`),
    ])
    const inCss = new Set([...Object.keys(light), ...Object.keys(dark)])
    const undocumented = [...inCss].filter((n) => !documented.has(n))
    expect(undocumented, 'add these to docs/design-system/tokens.json and the artifact').toEqual([])
  })
})
