// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { buildPersonalSpaceRecap, fetchBillsForRecap } from './groupBillActions'

describe('buildPersonalSpaceRecap', () => {
  it('totals every item and splits it by category, biggest first', () => {
    const categories = [
      { id: 'cat-food', name: 'Groceries' },
      { id: 'cat-fun', name: 'Going out' },
    ]
    const bills = [
      { items: [{ total_price: '12.50', category_id: 'cat-food' }, { total_price: '3', category_id: null }] },
      { items: [{ total_price: '25', category_id: 'cat-fun' }, { total_price: '7.5', category_id: 'cat-food' }] },
      { items: [] },
    ]
    expect(buildPersonalSpaceRecap({ name: 'Me' }, bills, categories)).toEqual({
      groupName: 'Me',
      totalSpent: 48,
      billCount: 3,
      categoryRows: [
        { key: 'Going out', name: 'Going out', amount: 25 },
        { key: 'Groceries', name: 'Groceries', amount: 20 },
        { key: 'Uncategorized', name: 'Uncategorized', amount: 3 },
      ],
    })
  })

  it('copes with bills not loaded yet', () => {
    expect(buildPersonalSpaceRecap({ name: 'Me' }, null, [])).toEqual({
      groupName: 'Me',
      totalSpent: 0,
      billCount: 0,
      categoryRows: [],
    })
  })
})

describe('fetchBillsForRecap', () => {
  it('asks for just those bills and names their payers as the recap expects', async () => {
    const query = {
      select: vi.fn(() => query),
      in: vi.fn(() => query),
      order: vi.fn(() =>
        Promise.resolve({ data: [{ id: 'b1', bill_payers: [{ member_id: 'm1', amount: 4 }] }, { id: 'b2' }], error: null })
      ),
    }
    const supabase = { from: vi.fn(() => query) }
    const bills = await fetchBillsForRecap(supabase, ['b1', 'b2'])
    expect(query.in).toHaveBeenCalledWith('id', ['b1', 'b2'])
    expect(bills.map((b) => b.payers)).toEqual([[{ member_id: 'm1', amount: 4 }], []])
  })

  it('throws when the request fails', async () => {
    const failure = new Error('offline')
    const query = { select: () => query, in: () => query, order: () => Promise.resolve({ data: null, error: failure }) }
    await expect(fetchBillsForRecap({ from: () => query }, ['b1'])).rejects.toBe(failure)
  })
})
