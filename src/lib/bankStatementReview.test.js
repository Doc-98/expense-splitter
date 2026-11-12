// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applySuggestions, initialReviewEntry, needsSuggestion, resolveCategoryHints } from './bankStatementReview'

describe('resolveCategoryHints', () => {
  const categoryNameToId = new Map([
    ['groceries', 'cat-groceries'],
    ['eating out', 'cat-eatingout'],
  ])

  it('resolves a hint that matches a real category name exactly, no ask needed', () => {
    const txs = [{ categoryHint: 'Groceries' }, { categoryHint: 'Eating Out' }]
    const { resolved, unresolved } = resolveCategoryHints(txs, categoryNameToId, {})
    expect(resolved.get('groceries')).toBe('cat-groceries')
    expect(resolved.get('eating out')).toBe('cat-eatingout')
    expect(unresolved.size).toBe(0)
  })

  it('collects an unmatched bank category name as unresolved, counting occurrences', () => {
    const txs = [{ categoryHint: 'Alimentazione' }, { categoryHint: 'alimentazione' }, { categoryHint: 'Trasporti' }]
    const { resolved, unresolved } = resolveCategoryHints(txs, categoryNameToId, {})
    expect(resolved.size).toBe(0)
    expect(unresolved.get('alimentazione')).toEqual({ label: 'Alimentazione', count: 2 })
    expect(unresolved.get('trasporti')).toEqual({ label: 'Trasporti', count: 1 })
  })

  it('reuses a previously-stored mapping, including an explicit "leave uncategorized"', () => {
    const txs = [{ categoryHint: 'Alimentazione' }, { categoryHint: 'Bollette' }]
    const stored = { alimentazione: 'cat-groceries', bollette: null }
    const { resolved, unresolved } = resolveCategoryHints(txs, categoryNameToId, stored)
    expect(resolved.get('alimentazione')).toBe('cat-groceries')
    expect(resolved.has('bollette')).toBe(true)
    expect(resolved.get('bollette')).toBeNull()
    expect(unresolved.size).toBe(0)
  })

  it("leaves out the categories that only money coming in has: those rows never get a card", () => {
    const txs = [
      { direction: 'credit', categoryHint: 'Stipendio' },
      { direction: 'debit', categoryHint: 'Trasporti' },
      { direction: 'credit', categoryHint: 'Trasporti' },
    ]
    const { unresolved } = resolveCategoryHints(txs, categoryNameToId, {})
    expect([...unresolved.keys()]).toEqual(['trasporti'])
    expect(unresolved.get('trasporti').count).toBe(1)
  })

  it('returns nothing for a statement with no category column at all', () => {
    const txs = [{ categoryHint: null }, { categoryHint: undefined }, {}]
    const { resolved, unresolved } = resolveCategoryHints(txs, categoryNameToId, {})
    expect(resolved.size).toBe(0)
    expect(unresolved.size).toBe(0)
  })
})

describe('initialReviewEntry', () => {
  const noDuplicates = new Set()
  const noCrossMatches = new Map()

  it('includes a debit that is not a duplicate or cross-group match', () => {
    const entry = initialReviewEntry({ direction: 'debit' }, noDuplicates, noCrossMatches, 0, new Map())
    expect(entry.include).toBe(true)
    expect(entry.reviewed).toBe(false)
    expect(entry.billId).toBeNull()
    expect(entry.itemId).toBeNull()
  })

  it('excludes a credit', () => {
    const entry = initialReviewEntry({ direction: 'credit' }, noDuplicates, noCrossMatches, 0, new Map())
    expect(entry.include).toBe(false)
  })

  it('excludes a flagged duplicate even if it is a debit', () => {
    const entry = initialReviewEntry({ direction: 'debit' }, new Set([0]), noCrossMatches, 0, new Map())
    expect(entry.include).toBe(false)
  })

  it('excludes a flagged cross-group match even if it is a debit', () => {
    const crossMatches = new Map([[0, 'Roommates']])
    const entry = initialReviewEntry({ direction: 'debit' }, noDuplicates, crossMatches, 0, new Map())
    expect(entry.include).toBe(false)
  })

  it('pre-fills categoryId from a resolved hint', () => {
    const hintMap = new Map([['groceries', 'cat-groceries']])
    const entry = initialReviewEntry({ direction: 'debit', categoryHint: 'Groceries' }, noDuplicates, noCrossMatches, 0, hintMap)
    expect(entry.categoryId).toBe('cat-groceries')
    expect(entry.categorySource).toBe('bank')
  })

  it("prefers what this merchant's earlier bills were filed under over the bank's category", () => {
    const hintMap = new Map([['altre uscite', 'cat-other']])
    const memory = new Map([['coop centro', 'cat-groceries']])
    const tx = { direction: 'debit', description: 'COOP CENTRO 26/08', categoryHint: 'Altre uscite' }
    const entry = initialReviewEntry(tx, noDuplicates, noCrossMatches, 0, hintMap, memory)
    expect(entry.categoryId).toBe('cat-groceries')
    expect(entry.categorySource).toBe('history')
  })

  it('says nothing about where the category came from when there is none', () => {
    const entry = initialReviewEntry({ direction: 'debit', description: 'Coop' }, noDuplicates, noCrossMatches, 0, new Map())
    expect(entry).not.toHaveProperty('categorySource')
  })

  it('falls back to blank when the hint resolved to null ("leave uncategorized")', () => {
    const hintMap = new Map([['bollette', null]])
    const entry = initialReviewEntry({ direction: 'debit', categoryHint: 'Bollette' }, noDuplicates, noCrossMatches, 0, hintMap)
    expect(entry.categoryId).toBe('')
  })

  it('falls back to blank when there is no categoryHint at all', () => {
    const entry = initialReviewEntry({ direction: 'debit' }, noDuplicates, noCrossMatches, 0, new Map())
    expect(entry.categoryId).toBe('')
  })
})

describe('needsSuggestion', () => {
  const debit = { direction: 'debit' }

  it('asks about a spending row with no category yet', () => {
    expect(needsSuggestion(debit, { categoryId: '', reviewed: false })).toBe(true)
  })

  it("asks again about one that only has the bank's category", () => {
    expect(needsSuggestion(debit, { categoryId: 'cat-bills', categorySource: 'bank', reviewed: false })).toBe(true)
  })

  it('leaves alone anything from history, from the AI, or picked by hand', () => {
    expect(needsSuggestion(debit, { categoryId: 'cat-a', categorySource: 'history' })).toBe(false)
    expect(needsSuggestion(debit, { categoryId: 'cat-a', categorySource: 'ai' })).toBe(false)
    expect(needsSuggestion(debit, { categoryId: '', categorySource: 'ai' })).toBe(false)
    expect(needsSuggestion(debit, { categoryId: '', categorySource: 'manual' })).toBe(false)
    expect(needsSuggestion(debit, { categoryId: 'cat-a' })).toBe(false) // a draft saved before sources existed
  })

  it('leaves alone money coming in and anything already confirmed', () => {
    expect(needsSuggestion({ direction: 'credit' }, { categoryId: '' })).toBe(false)
    expect(needsSuggestion(debit, { categoryId: '', reviewed: true })).toBe(false)
    expect(needsSuggestion(debit, { categoryId: 'cat-bills', categorySource: 'bank', reviewed: true })).toBe(false)
  })
})

describe('applySuggestions', () => {
  const transactions = [
    { direction: 'debit', description: 'Pagamento Pos' },
    { direction: 'debit', description: 'Addebito PayPal' },
    { direction: 'debit', description: 'Bar Centrale' },
    { direction: 'debit', description: 'Coop' },
    { direction: 'credit', description: 'Stipendio' },
  ]
  const review = [
    { categoryId: 'cat-other', categorySource: 'bank', reviewed: false },
    { categoryId: 'cat-bills', categorySource: 'bank', reviewed: false },
    { categoryId: 'cat-tech', categorySource: 'bank', reviewed: false },
    { categoryId: 'cat-groceries', categorySource: 'manual', reviewed: false },
    { categoryId: '', reviewed: false },
  ]
  const categoryIdByName = new Map([
    ['Eating out', 'cat-eatingout'],
    ['Groceries', 'cat-groceries'],
  ])
  const keyOf = (tx) => tx.description

  it("replaces the bank's category with the AI's answer, and clears it when the AI can't tell", () => {
    const results = new Map([
      ['Pagamento Pos', 'Eating out'],
      ['Addebito PayPal', null],
      ['Coop', 'Eating out'],
      ['Stipendio', 'Groceries'],
    ])
    const next = applySuggestions(review, transactions, results, keyOf, categoryIdByName)
    expect(next[0]).toMatchObject({ categoryId: 'cat-eatingout', categorySource: 'ai' })
    expect(next[1]).toMatchObject({ categoryId: '', categorySource: 'ai' })
    expect(next[2]).toBe(review[2]) // no answer came back for it: the bank's category stays
    expect(next[3]).toBe(review[3]) // picked by hand
    expect(next[4]).toBe(review[4]) // money coming in
  })

  it('treats a category name this group does not have as no answer', () => {
    const next = applySuggestions(review, transactions, new Map([['Pagamento Pos', 'Holidays']]), keyOf, categoryIdByName)
    expect(next[0]).toMatchObject({ categoryId: '', categorySource: 'ai' })
  })
})
