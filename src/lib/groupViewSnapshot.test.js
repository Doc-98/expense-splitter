import { describe, it, expect, vi, afterEach } from 'vitest'
import { computeGroupViewSnapshot } from './groupViewSnapshot'

describe('computeGroupViewSnapshot', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('no longer computes a settlement/balance at all — that comes from fetchGroupSettlement now', () => {
    const bills = [{ id: 'b1', paid_by: 'alice', created_at: '2026-01-01T00:00:00Z', items: [{ id: 'i1', total_price: 20, item_shares: [{ member_id: 'alice', shares: 1 }] }], bill_payers: [] }]
    const snapshot = computeGroupViewSnapshot(bills)
    expect(snapshot).not.toHaveProperty('settlement')
    expect(Object.keys(snapshot).sort()).toEqual(['billPersonalTotals', 'monthTotal', 'weekTotal'])
  })

  it('computes each bill its own paid/consumed personal totals', () => {
    const bills = [
      {
        id: 'b1',
        paid_by: 'alice',
        created_at: '2026-01-01T00:00:00Z',
        items: [{ id: 'i1', total_price: 20, item_shares: [{ member_id: 'alice', shares: 1 }, { member_id: 'bob', shares: 1 }] }],
        bill_payers: [],
      },
    ]
    const { billPersonalTotals } = computeGroupViewSnapshot(bills)
    expect(billPersonalTotals['b1'].alice).toEqual({ paid: 20, consumed: 10 })
    expect(billPersonalTotals['b1'].bob).toEqual({ paid: 0, consumed: 10 })
  })

  it('sums week/month totals only from bills actually inside each window', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 15)) // Tuesday Sep 15, 2026

    const bills = [
      // Inside this week (Mon Sep 14 - Sun Sep 20) and this month.
      {
        id: 'b1',
        paid_by: 'alice',
        created_at: new Date(2026, 8, 15).toISOString(),
        items: [{ id: 'i1', total_price: 12, item_shares: [{ member_id: 'alice', shares: 1 }] }],
        bill_payers: [],
      },
      // Inside this month, but before this week started.
      {
        id: 'b2',
        paid_by: 'alice',
        created_at: new Date(2026, 8, 2).toISOString(),
        items: [{ id: 'i2', total_price: 8, item_shares: [{ member_id: 'alice', shares: 1 }] }],
        bill_payers: [],
      },
      // Outside both.
      {
        id: 'b3',
        paid_by: 'alice',
        created_at: new Date(2026, 7, 1).toISOString(),
        items: [{ id: 'i3', total_price: 100, item_shares: [{ member_id: 'alice', shares: 1 }] }],
        bill_payers: [],
      },
    ]

    const { weekTotal, monthTotal } = computeGroupViewSnapshot(bills)
    expect(weekTotal).toBe(12)
    expect(monthTotal).toBe(20)
  })

  it('returns empty totals for an empty bill list, rather than throwing', () => {
    const { billPersonalTotals, weekTotal, monthTotal } = computeGroupViewSnapshot([])
    expect(billPersonalTotals).toEqual({})
    expect(weekTotal).toBe(0)
    expect(monthTotal).toBe(0)
  })
})
