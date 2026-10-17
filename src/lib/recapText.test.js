// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { formatBillRecap, formatMultiBillRecap, formatPersonalSpaceRecap } from './recapText'

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

describe('formatBillRecap — categories', () => {
  const members = [{ id: 'm1', name: 'Ana' }]
  const categories = [
    { id: 'food', name: 'Groceries' },
    { id: 'home', name: 'Household' },
  ]
  const item = (name, total_price, category_id = null) => ({
    name,
    quantity: 1,
    total_price,
    category_id,
    item_shares: [{ member_id: 'm1' }],
  })

  it('reads as before when nothing has a category', () => {
    const text = formatBillRecap({ title: 'Shop' }, [item('Milk', 2)], members, money, categories)
    expect(text).toBe('*Shop*\n\nMilk — €2.00 (Ana)\n\n*Total: €2.00*')
  })

  it("names a single category under the title, the bill's own included", () => {
    const text = formatBillRecap({ title: 'Shop', category_id: 'food' }, [item('Milk', 2), item('Eggs', 3, 'food')], members, money, categories)
    expect(text.split('\n').slice(0, 2)).toEqual(['*Shop*', 'Category: Groceries'])
    expect(text).not.toContain('By category')
  })

  it('lists subtotals per category above the total when there are several', () => {
    const text = formatBillRecap(
      { title: 'Shop', category_id: 'food' },
      [item('Milk', 2), item('Soap', 4.5, 'home'), item('Eggs', 3)],
      members,
      money,
      categories
    )
    expect(text.split('\n').slice(-6)).toEqual([
      '',
      'By category',
      'Groceries — €5.00',
      'Household — €4.50',
      '',
      '*Total: €9.50*',
    ])
  })
})

describe('formatMultiBillRecap — categories', () => {
  const members = [{ id: 'm1', name: 'Ana' }]
  const categories = [
    { id: 'food', name: 'Groceries' },
    { id: 'home', name: 'Household' },
  ]
  const bill = (title, category_id, items) => ({
    title,
    category_id,
    items: items.map(([name, total_price, cat]) => ({ name, quantity: 1, total_price, category_id: cat ?? null, item_shares: [] })),
  })

  it("adds subtotals across every bill, each bill's own category counted", () => {
    const text = formatMultiBillRecap(
      [bill('Shop', 'food', [['Milk', 2]]), bill('Hardware', null, [['Soap', 4, 'home'], ['Bag', 1]])],
      members,
      money,
      categories
    )
    expect(text.split('\n').slice(-7)).toEqual([
      '',
      'By category',
      'Groceries — €2.00',
      'Household — €4.00',
      'No category — €1.00',
      '',
      '*Grand total: €7.00*',
    ])
  })

  it('has no subtotals when nothing is categorized', () => {
    const text = formatMultiBillRecap([bill('A', null, [['x', 1]]), bill('B', null, [['y', 2]])], members, money, categories)
    expect(text).not.toContain('By category')
    expect(text.endsWith('*Grand total: €3.00*')).toBe(true)
  })
})

