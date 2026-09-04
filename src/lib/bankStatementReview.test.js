import { describe, it, expect } from 'vitest'
import { initialReviewEntry, resolveCategoryHints } from './bankStatementReview'

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
