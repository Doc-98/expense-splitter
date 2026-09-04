import { describe, it, expect } from 'vitest'
import { findDuplicateIndexes, findCrossGroupMatches } from './bankStatementDetection'

describe('findDuplicateIndexes', () => {
  it('flags a transaction matching an existing bill within the date window', () => {
    const transactions = [{ description: 'AMAZON MKTPLACE PMTS*UK 123456', amount: 42.1, date: '2026-03-05T00:00:00Z' }]
    const existingBills = [{ description: 'Amazon Mktplace Pmts', amount: 42.1, date: '2026-03-06T00:00:00Z' }]
    expect(findDuplicateIndexes(transactions, existingBills)).toEqual(new Set([0]))
  })

  it('does not flag a same-description transaction whose amount differs', () => {
    const transactions = [{ description: 'Amazon', amount: 42.1, date: '2026-03-05T00:00:00Z' }]
    const existingBills = [{ description: 'Amazon', amount: 12.0, date: '2026-03-05T00:00:00Z' }]
    expect(findDuplicateIndexes(transactions, existingBills)).toEqual(new Set())
  })

  it('does not flag a match outside the date window', () => {
    const transactions = [{ description: 'Amazon', amount: 42.1, date: '2026-03-05T00:00:00Z' }]
    const existingBills = [{ description: 'Amazon', amount: 42.1, date: '2026-04-05T00:00:00Z' }]
    expect(findDuplicateIndexes(transactions, existingBills)).toEqual(new Set())
  })

  it('normalizes away reference numbers so two printings of the same merchant match', () => {
    const transactions = [{ description: 'AMAZON MKTPLACE PMTS*UK 987654', amount: 10, date: '2026-03-05T00:00:00Z' }]
    const existingBills = [{ description: 'AMAZON MKTPLACE PMTS*DE 111222', amount: 10, date: '2026-03-05T00:00:00Z' }]
    expect(findDuplicateIndexes(transactions, existingBills)).toEqual(new Set([0]))
  })

  it('skips a transaction with no usable description', () => {
    const transactions = [{ description: '12345', amount: 10, date: '2026-03-05T00:00:00Z' }]
    const existingBills = [{ description: '12345', amount: 10, date: '2026-03-05T00:00:00Z' }]
    expect(findDuplicateIndexes(transactions, existingBills)).toEqual(new Set())
  })
})

describe('findCrossGroupMatches', () => {
  it('matches by amount and date only, no description required', () => {
    const transactions = [{ description: 'RESTAURANT XYZ 4821', amount: 60, date: '2026-03-05T00:00:00Z' }]
    const otherGroupBills = [{ description: 'Dinner with roommates', amount: 60, date: '2026-03-06T00:00:00Z', groupName: 'Roommates' }]
    const matches = findCrossGroupMatches(transactions, otherGroupBills)
    expect(matches.get(0)).toBe('Roommates')
  })

  it('does not match outside the amount tolerance', () => {
    const transactions = [{ description: 'X', amount: 60, date: '2026-03-05T00:00:00Z' }]
    const otherGroupBills = [{ description: 'Y', amount: 60.5, date: '2026-03-05T00:00:00Z', groupName: 'Roommates' }]
    expect(findCrossGroupMatches(transactions, otherGroupBills).size).toBe(0)
  })

  it('returns an empty map when nothing is passed', () => {
    expect(findCrossGroupMatches([{ description: 'X', amount: 10, date: '2026-03-05T00:00:00Z' }]).size).toBe(0)
  })
})
