// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { buildClassifyPrompt, parseClassifyResponse } from './classifyPrompt'

describe('buildClassifyPrompt', () => {
  it('includes every category name and titled title', () => {
    const prompt = buildClassifyPrompt(['Groceries', 'Eating out'], ['Coop Milano', 'SDD Netflix'], '')
    expect(prompt).toContain('"Groceries"')
    expect(prompt).toContain('"Eating out"')
    expect(prompt).toContain('0. "Coop Milano"')
    expect(prompt).toContain('1. "SDD Netflix"')
  })

  it('asks for a best guess whenever there is any signal, not only when confident', () => {
    const prompt = buildClassifyPrompt(['Groceries'], ['x'], '')
    expect(prompt).toMatch(/Always make a guess when the title gives you \*any\* signal/)
    expect(prompt).toMatch(/Only return null when a title is genuinely unreadable/)
  })

  it('notes titles may be in any language', () => {
    const prompt = buildClassifyPrompt(['Groceries'], ['x'], '')
    expect(prompt).toMatch(/any language/)
  })

  it('includes household context only when provided', () => {
    const withContext = buildClassifyPrompt(['Groceries'], ['x'], 'Bob = Netflix')
    expect(withContext).toContain('Bob = Netflix')

    const withoutContext = buildClassifyPrompt(['Groceries'], ['x'], '')
    expect(withoutContext).not.toContain('Context from this household')
  })
})

describe('buildClassifyPrompt with bank statement evidence', () => {
  const entries = [
    { title: 'Pagamento Pos', details: 'PRESSO Bar Centrale Roma', bankCategory: 'Altre uscite', bankCategoryMappedTo: null },
    { title: 'Addebito diretto PayPal', details: null, bankCategory: 'Domiciliazioni e Utenze', bankCategoryMappedTo: 'Bills & utilities' },
    { title: 'Coop Milano', details: null, bankCategory: null, bankCategoryMappedTo: null },
  ]
  const prompt = buildClassifyPrompt(['Groceries', 'Eating out'], entries, '')

  it("puts each transaction's details and bank category on its own line", () => {
    expect(prompt).toContain(`0. "Pagamento Pos" | details: "PRESSO Bar Centrale Roma" | bank's category: "Altre uscite"`)
    expect(prompt).toContain(
      `1. "Addebito diretto PayPal" | bank's category: "Domiciliazioni e Utenze" (this household usually files it under "Bills & utilities")`
    )
    expect(prompt).toMatch(/2\. "Coop Milano"$/)
  })

  it("says the bank's category is a hint that can be wrong, and that an unknowable payment gets no guess", () => {
    expect(prompt).toMatch(/Treat it as a hint, not an answer/)
    expect(prompt).toMatch(/follow the merchant/)
    expect(prompt).toMatch(/return null for it rather than guessing from the bank's category/)
  })

  it('leaves the prompt for plain titles exactly as it was', () => {
    const plain = buildClassifyPrompt(['Groceries'], ['Coop Milano'], '')
    expect(plain).not.toMatch(/bank's category/)
    expect(buildClassifyPrompt(['Groceries'], [{ title: 'Coop Milano', details: null, bankCategory: null }], '')).toBe(plain)
  })
})

describe('parseClassifyResponse', () => {
  const categoryNames = ['Groceries', 'Eating out']
  const titles = ['Coop Milano', 'SDD Netflix', 'xkzq2211']

  it('maps each index back to its category', () => {
    const raw = JSON.stringify({
      results: [
        { index: 0, category: 'Groceries' },
        { index: 1, category: 'Eating out' },
        { index: 2, category: null },
      ],
    })
    expect(parseClassifyResponse(raw, titles, categoryNames)).toEqual(['Groceries', 'Eating out', null])
  })

  it('is case-insensitive against the real category list', () => {
    const raw = JSON.stringify({ results: [{ index: 0, category: 'groceries' }] })
    expect(parseClassifyResponse(raw, titles, categoryNames)[0]).toBe('Groceries')
  })

  it('ignores a category the model invented that is not in the list', () => {
    const raw = JSON.stringify({ results: [{ index: 0, category: 'Made Up Category' }] })
    expect(parseClassifyResponse(raw, titles, categoryNames)[0]).toBeNull()
  })

  it('ignores an out-of-range index without discarding the rest', () => {
    const raw = JSON.stringify({
      results: [
        { index: 99, category: 'Groceries' },
        { index: 0, category: 'Groceries' },
      ],
    })
    const results = parseClassifyResponse(raw, titles, categoryNames)
    expect(results[0]).toBe('Groceries')
    expect(results).toHaveLength(3)
  })

  it('returns all-null for a response that fails to parse at all', () => {
    expect(parseClassifyResponse('not json', titles, categoryNames)).toEqual([null, null, null])
  })

  it('returns fewer results than titles gracefully when the model returns partial results', () => {
    const raw = JSON.stringify({ results: [{ index: 0, category: 'Groceries' }] })
    const results = parseClassifyResponse(raw, titles, categoryNames)
    expect(results).toEqual(['Groceries', null, null])
  })
})
