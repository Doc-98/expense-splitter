// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { groupItemsByDate } from './dateGroups'

function bill(y, m, d, id) {
  return { id, created_at: new Date(y, m, d, 12, 0).toISOString() }
}

describe('groupItemsByDate', () => {
  it('groups items into one month section per calendar month, in input order', () => {
    const items = [bill(2026, 8, 20, 'a'), bill(2026, 8, 5, 'b'), bill(2026, 7, 30, 'c')]
    const groups = groupItemsByDate(items)
    expect(groups.map((g) => g.label)).toEqual(['September 2026', 'August 2026'])
  })

  it('splits a month into one day section per calendar day, in input order', () => {
    const items = [bill(2026, 8, 20, 'a'), bill(2026, 8, 5, 'b')]
    const groups = groupItemsByDate(items)
    expect(groups[0].days.map((d) => d.items.map((i) => i.id))).toEqual([['a'], ['b']])
  })

  it('keeps multiple same-day items in one day group instead of splitting them', () => {
    const items = [bill(2026, 8, 5, 'a'), bill(2026, 8, 5, 'b'), bill(2026, 8, 5, 'c')]
    const groups = groupItemsByDate(items)
    expect(groups[0].days).toHaveLength(1)
    expect(groups[0].days[0].items.map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })

  // The actual bug this guards against: a day divider used to show just
  // the bare day number ("5") — fine directly under its own month header,
  // but every one of them looks identical at a glance regardless of which
  // month you're actually in, once you're mid-scroll and that header
  // isn't in view. Every day label now carries its own short month too.
  it('labels each day with its short month, not a bare day number', () => {
    const items = [bill(2026, 8, 5, 'a'), bill(2026, 6, 31, 'b')]
    const groups = groupItemsByDate(items)
    expect(groups[0].days[0].label).toBe('Sep 5')
    expect(groups[1].days[0].label).toBe('Jul 31')
  })

  it('starts a fresh day group at a month boundary even for adjacent days', () => {
    const items = [bill(2026, 8, 1, 'a'), bill(2026, 7, 31, 'b')]
    const groups = groupItemsByDate(items)
    expect(groups).toHaveLength(2)
    expect(groups[0].days).toHaveLength(1)
    expect(groups[1].days).toHaveLength(1)
  })

  it('returns an empty array for an empty input', () => {
    expect(groupItemsByDate([])).toEqual([])
  })
})
