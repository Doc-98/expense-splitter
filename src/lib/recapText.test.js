// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { formatPersonalSpaceRecap } from './recapText'

const money = (n) => `€${n.toFixed(2)}`

describe('formatPersonalSpaceRecap', () => {
  it('says there are no bills yet rather than a $0.00 total', () => {
    const text = formatPersonalSpaceRecap({ groupName: 'Personal', totalSpent: 0, billCount: 0, categoryRows: [] }, money)
    expect(text).toBe('*Personal*\n\nNo bills yet.')
  })

  it('uses singular "bill" for exactly one', () => {
    const text = formatPersonalSpaceRecap(
      { groupName: 'Personal', totalSpent: 12, billCount: 1, categoryRows: [] },
      money
    )
    expect(text.split('\n')).toContain('1 bill')
  })

  it('uses plural "bills" for more than one', () => {
    const text = formatPersonalSpaceRecap(
      { groupName: 'Personal', totalSpent: 40, billCount: 3, categoryRows: [] },
      money
    )
    expect(text).toContain('3 bills')
  })

  it('includes total spent and every category row, in the order given', () => {
    const text = formatPersonalSpaceRecap(
      {
        groupName: 'Personal',
        totalSpent: 100,
        billCount: 4,
        categoryRows: [
          { key: 'groceries', name: 'Groceries', amount: 70 },
          { key: 'uncategorized', name: 'Uncategorized', amount: 30 },
        ],
      },
      money
    )
    expect(text).toBe(
      [
        '*Personal*',
        '',
        'Total spent: €100.00',
        '4 bills',
        '',
        '*By category*',
        'Groceries — €70.00',
        'Uncategorized — €30.00',
      ].join('\n')
    )
  })

  it('omits the "By category" section entirely when there are no category rows', () => {
    const text = formatPersonalSpaceRecap(
      { groupName: 'Personal', totalSpent: 20, billCount: 2, categoryRows: [] },
      money
    )
    expect(text).not.toContain('By category')
  })
})
