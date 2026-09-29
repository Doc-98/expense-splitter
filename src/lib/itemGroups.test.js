// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { groupItemsByCategory } from './itemGroups'

const CATEGORIES = [
  { id: 'food', name: 'Groceries' },
  { id: 'home', name: 'Household' },
]
const item = (id, category_id, total_price) => ({ id, category_id, total_price })

describe('groupItemsByCategory', () => {
  it('groups in order of first appearance, keeps item order, and puts "No category" last', () => {
    const items = [
      item('a', null, '1.00'),
      item('b', 'home', '2.15'),
      item('c', 'food', '1.29'),
      item('d', null, '0.10'),
      item('e', 'home', '0.20'),
    ]
    const groups = groupItemsByCategory(items, CATEGORIES, null)
    expect(groups.map((g) => g.category?.name ?? 'none')).toEqual(['Household', 'Groceries', 'none'])
    expect(groups[0].items.map((i) => i.id)).toEqual(['b', 'e'])
    expect(groups[2].items.map((i) => i.id)).toEqual(['a', 'd'])
  })

  it("files items with no category of their own under the bill's", () => {
    const groups = groupItemsByCategory([item('a', null, '1'), item('b', 'home', '2')], CATEGORIES, 'food')
    expect(groups.map((g) => g.category.name)).toEqual(['Groceries', 'Household'])
  })

  it('adds up each subtotal to the cent', () => {
    const [g] = groupItemsByCategory([item('a', 'food', '0.1'), item('b', 'food', '0.2')], CATEGORIES, null)
    expect(g.total).toBe(0.3)
  })

  it("treats a deleted category like no category", () => {
    const [g] = groupItemsByCategory([item('a', 'gone', '1')], CATEGORIES, null)
    expect(g.category).toBeNull()
  })
})
