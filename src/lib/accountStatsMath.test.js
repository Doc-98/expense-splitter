// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { overallBalanceFrom, splitByGroup, totalsByBill } from './accountStatsMath'

describe('overallBalanceFrom', () => {
  const groupIds = ['g1', 'g2']
  const me = new Map([
    ['g1', 'me-in-g1'],
    ['g2', 'me-in-g2'],
  ])

  it("adds up my balance in each group plus unsettled balances from groups I've left", () => {
    const balances = [
      { 'me-in-g1': 12.5, other: -12.5 },
      { 'me-in-g2': -4.25, other: 4.25 },
    ]
    const snapshots = [
      { group_id: 'old', balance: '3.10', balance_settled: false },
      { group_id: 'older', balance: '100', balance_settled: true },
    ]
    expect(overallBalanceFrom(groupIds, me, balances, snapshots)).toBe(11.35)
  })

  it("counts a group where I don't appear in the balances as zero", () => {
    expect(overallBalanceFrom(groupIds, me, [{}, { 'me-in-g2': 2 }], [])).toBe(2)
  })

  it('rounds to cents', () => {
    expect(overallBalanceFrom(['g1'], me, [{ 'me-in-g1': 0.1 + 0.2 }], [])).toBe(0.3)
  })
})

describe('totalsByBill', () => {
  it("sums each bill's items, reading money strings as numbers", () => {
    const totals = totalsByBill([
      { bill_id: 'a', total_price: '10.50' },
      { bill_id: 'b', total_price: '3' },
      { bill_id: 'a', total_price: '4.50' },
    ])
    expect(totals.get('a')).toBe(15)
    expect(totals.get('b')).toBe(3)
    expect(totals.get('missing')).toBeUndefined()
  })
})

describe('splitByGroup', () => {
  it('puts every bill, item and share in its own group, in groupIds order', () => {
    const derived = {
      list: [
        { id: 'b1', group_id: 'g1' },
        { id: 'b2', group_id: 'g2' },
        { id: 'b3', group_id: 'g-not-mine' },
      ],
      items: [
        { id: 'i1', bill_id: 'b1' },
        { id: 'i2', bill_id: 'b2' },
        { id: 'i3', bill_id: 'b3' },
      ],
      itemShares: [
        { item_id: 'i1', user_id: 'x' },
        { item_id: 'i2', user_id: 'y' },
        { item_id: 'i3', user_id: 'z' },
      ],
    }
    const [g2, g1] = splitByGroup(derived, ['g2', 'g1'])
    expect(g1).toEqual({ bills: [derived.list[0]], items: [derived.items[0]], itemShares: [derived.itemShares[0]] })
    expect(g2).toEqual({ bills: [derived.list[1]], items: [derived.items[1]], itemShares: [derived.itemShares[1]] })
  })

  it('gives a group with no bills empty slices', () => {
    expect(splitByGroup({ list: [], items: [], itemShares: [] }, ['g1'])).toEqual([{ bills: [], items: [], itemShares: [] }])
  })
})
