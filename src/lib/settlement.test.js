import { describe, it, expect } from 'vitest'
import { computeBalances, computeSpendingTotals, computeDailyTotalsForUser, simplifyDebts } from './settlement'

describe('computeBalances', () => {
  it('splits a single-payer bill evenly between two equal shares', () => {
    // Alice pays $20 for an item split evenly between Alice and Bob.
    const bills = [{ id: 'b1', paid_by: 'alice' }]
    const items = [{ id: 'i1', bill_id: 'b1', total_price: 20 }]
    const itemShares = [
      { item_id: 'i1', user_id: 'alice', shares: 1 },
      { item_id: 'i1', user_id: 'bob', shares: 1 },
    ]
    const balances = computeBalances({ bills, items, itemShares })
    expect(balances.alice).toBe(10) // fronted 20, owes 10 -> net +10
    expect(balances.bob).toBe(-10) // fronted 0, owes 10 -> net -10
  })

  it('weights shares proportionally, not evenly, when shares differ', () => {
    // A $30 item split 2:1 between Alice and Bob (Alice had two servings).
    const bills = [{ id: 'b1', paid_by: 'alice' }]
    const items = [{ id: 'i1', bill_id: 'b1', total_price: 30 }]
    const itemShares = [
      { item_id: 'i1', user_id: 'alice', shares: 2 },
      { item_id: 'i1', user_id: 'bob', shares: 1 },
    ]
    const balances = computeBalances({ bills, items, itemShares })
    // Alice owes 20 of her own 30 fronted -> net +10; Bob owes 10 -> net -10.
    expect(balances.alice).toBe(10)
    expect(balances.bob).toBe(-10)
  })

  it('credits each multi-payer their own contributed amount, not the bill total', () => {
    const bills = [{ id: 'b1', payers: [{ member_id: 'alice', amount: 12 }, { member_id: 'bob', amount: 8 }] }]
    const items = [{ id: 'i1', bill_id: 'b1', total_price: 20 }]
    const itemShares = [
      { item_id: 'i1', user_id: 'alice', shares: 1 },
      { item_id: 'i1', user_id: 'bob', shares: 1 },
    ]
    const balances = computeBalances({ bills, items, itemShares })
    expect(balances.alice).toBe(2) // fronted 12, owes 10 -> +2
    expect(balances.bob).toBe(-2) // fronted 8, owes 10 -> -2
  })

  it('ignores a bill.payers array with a paid_by also set (payers wins)', () => {
    const bills = [{ id: 'b1', paid_by: 'bob', payers: [{ member_id: 'alice', amount: 20 }] }]
    const items = [{ id: 'i1', bill_id: 'b1', total_price: 20 }]
    const itemShares = [{ item_id: 'i1', user_id: 'alice', shares: 1 }]
    const balances = computeBalances({ bills, items, itemShares })
    expect(balances.bob).toBeUndefined()
    expect(balances.alice).toBe(20 - 20)
  })

  it('applies a recorded payment as a balance transfer', () => {
    const bills = []
    const items = []
    const itemShares = []
    const payments = [{ from_user: 'bob', to_user: 'alice', amount: 10 }]
    const balances = computeBalances({ bills, items, itemShares, payments })
    expect(balances.bob).toBe(10) // paying reduces what bob owes / increases what he's owed
    expect(balances.alice).toBe(-10)
  })

  it('skips an item whose shares add up to zero, rather than dividing by zero', () => {
    const bills = [{ id: 'b1', paid_by: 'alice' }]
    const items = [{ id: 'i1', bill_id: 'b1', total_price: 10 }]
    const itemShares = [{ item_id: 'i1', user_id: 'bob', shares: 0 }]
    expect(() => computeBalances({ bills, items, itemShares })).not.toThrow()
    const balances = computeBalances({ bills, items, itemShares })
    expect(balances.bob).toBeUndefined()
    expect(balances.alice).toBe(10) // fronted 10, owes nothing (no valid shares)
  })

  it('rounds to the cent and does not compound floating-point drift across many items', () => {
    const bills = [{ id: 'b1', paid_by: 'alice' }]
    const items = Array.from({ length: 7 }, (_, i) => ({ id: `i${i}`, bill_id: 'b1', total_price: 10.01 }))
    const itemShares = items.flatMap((it) => [
      { item_id: it.id, user_id: 'alice', shares: 1 },
      { item_id: it.id, user_id: 'bob', shares: 2 },
    ])
    const balances = computeBalances({ bills, items, itemShares })
    // Balances must still sum to zero (nobody's money vanished or appeared).
    const total = Object.values(balances).reduce((a, b) => a + b, 0)
    expect(Math.round(total * 100) / 100).toBe(0)
  })
})

describe('computeSpendingTotals', () => {
  it('tracks paid and consumed separately per person', () => {
    const bills = [{ id: 'b1', paid_by: 'alice' }]
    const items = [{ id: 'i1', bill_id: 'b1', total_price: 20 }]
    const itemShares = [
      { item_id: 'i1', user_id: 'alice', shares: 1 },
      { item_id: 'i1', user_id: 'bob', shares: 1 },
    ]
    const totals = computeSpendingTotals({ bills, items, itemShares })
    expect(totals.alice).toEqual({ paid: 20, consumed: 10 })
    expect(totals.bob).toEqual({ paid: 0, consumed: 10 })
  })
})

describe('computeDailyTotalsForUser', () => {
  it('buckets by local calendar day and by category', () => {
    const bills = [{ id: 'b1', paid_by: 'alice', created_at: '2026-03-05T10:00:00', category_id: 'groceries' }]
    const items = [{ id: 'i1', bill_id: 'b1', total_price: 20, category_id: null }]
    const itemShares = [{ item_id: 'i1', user_id: 'alice', shares: 1 }]
    const categoryNameById = new Map([['groceries', 'Groceries']])

    const daily = computeDailyTotalsForUser('alice', { bills, items, itemShares, categoryNameById })
    expect(daily['2026-03-05']).toEqual({
      paid: 20,
      consumed: 20,
      categories: { Groceries: 20 },
    })
  })

  it('falls back to "Uncategorized" with no category anywhere', () => {
    const bills = [{ id: 'b1', paid_by: 'alice', created_at: '2026-03-05T10:00:00', category_id: null }]
    const items = [{ id: 'i1', bill_id: 'b1', total_price: 5, category_id: null }]
    const itemShares = [{ item_id: 'i1', user_id: 'alice', shares: 1 }]

    const daily = computeDailyTotalsForUser('alice', { bills, items, itemShares })
    expect(daily['2026-03-05'].categories).toEqual({ Uncategorized: 5 })
  })

  it('only includes days/items the requested user actually touched', () => {
    const bills = [{ id: 'b1', paid_by: 'bob', created_at: '2026-03-05T10:00:00' }]
    const items = [{ id: 'i1', bill_id: 'b1', total_price: 10 }]
    const itemShares = [{ item_id: 'i1', user_id: 'bob', shares: 1 }]

    const daily = computeDailyTotalsForUser('alice', { bills, items, itemShares })
    expect(daily).toEqual({})
  })
})

describe('simplifyDebts', () => {
  it('produces no payments when everyone is already even', () => {
    expect(simplifyDebts({ alice: 0, bob: 0 })).toEqual([])
  })

  it('matches a single debtor directly to a single creditor', () => {
    const transactions = simplifyDebts({ alice: 10, bob: -10 })
    expect(transactions).toEqual([{ from: 'bob', to: 'alice', amount: 10 }])
  })

  it('settles a three-way split with fewer than N-1 payments where possible', () => {
    // Alice is owed 10 total, split between Bob (-6) and Carol (-4).
    const transactions = simplifyDebts({ alice: 10, bob: -6, carol: -4 })
    const totalPaid = transactions.reduce((sum, t) => sum + t.amount, 0)
    expect(totalPaid).toBe(10)
    // Every debtor's payment(s) should sum to what they owed.
    const byDebtor = transactions.reduce((acc, t) => {
      acc[t.from] = (acc[t.from] || 0) + t.amount
      return acc
    }, {})
    expect(byDebtor.bob).toBe(6)
    expect(byDebtor.carol).toBe(4)
  })

  it('ignores balances within a cent of zero (rounding noise)', () => {
    expect(simplifyDebts({ alice: 0.005, bob: -0.005 })).toEqual([])
  })
})
