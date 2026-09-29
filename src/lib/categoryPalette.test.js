// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { CATEGORY_COLORS, categoryColor } from './categoryPalette'

describe('categoryColor', () => {
  it('maps each preset to its slot variable, in CATEGORY_COLORS order', () => {
    expect(CATEGORY_COLORS.map(categoryColor)).toEqual([1, 2, 3, 4, 5, 6, 7].map((n) => `var(--category-${n})`))
  })

  it('maps the pre-September-2026 defaults to the same slots as their replacements', () => {
    expect(categoryColor('#4a86e8')).toBe('var(--category-1)') // Groceries
    expect(categoryColor('#cc4125')).toBe('var(--category-6)') // Health
    expect(categoryColor('#999999')).toBe('var(--category-7)') // Other
  })

  it('matches presets case-insensitively', () => {
    expect(categoryColor('#534195'.toUpperCase())).toBe('var(--category-1)')
  })

  it('passes a custom colour through exactly as saved, including the retired extra swatches', () => {
    expect(categoryColor('#a35d12')).toBe('#a35d12')
    expect(categoryColor('#f1c232')).toBe('#f1c232')
  })

  it('paints a missing colour (uncategorized) as the Other grey', () => {
    expect(categoryColor(null)).toBe('var(--category-7)')
    expect(categoryColor(undefined)).toBe('var(--category-7)')
  })

  it('is safe to call on an already-mapped value', () => {
    expect(categoryColor(categoryColor('#534195'))).toBe('var(--category-1)')
  })
})

describe('styles.css category variables', () => {
  // Each preset's saved value is also its light-theme default step, so a
  // category shows the colour it saves. Guards the two copies against drift.
  it('light default steps match CATEGORY_COLORS', async () => {
    const { readFileSync } = await import('node:fs')
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
    const block = css.match(/\/\* ---------- Category colours[\s\S]*?:root \{([^}]*)\}/)[1]
    const steps = [...block.matchAll(/--category-(\d): (#[0-9A-Fa-f]{6});/g)].map((m) => m[2].toLowerCase())
    expect(steps).toEqual(CATEGORY_COLORS)
  })
})
