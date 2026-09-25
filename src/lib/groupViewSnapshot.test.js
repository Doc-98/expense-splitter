// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { computeGroupViewSnapshot, fetchGroupBills } from './groupViewSnapshot'

describe('fetchGroupBills', () => {
  function fakeSupabase(result) {
    const rpc = vi.fn(() => Promise.resolve(result))
    return { supabase: { rpc }, rpc }
  }

  it('calls get_group_bills for the whole group when no window is given', async () => {
    const bills = [{ id: 'b1', items: [], bill_payers: [] }]
    const { supabase, rpc } = fakeSupabase({ data: bills, error: null })
    expect(await fetchGroupBills(supabase, 'group-1')).toEqual(bills)
    expect(rpc).toHaveBeenCalledWith('get_group_bills', { target_group_id: 'group-1' })
  })

  it('passes a first-paint window as an ISO timestamp', async () => {
    const { supabase, rpc } = fakeSupabase({ data: [], error: null })
    await fetchGroupBills(supabase, 'group-1', { since: new Date('2025-01-01T00:00:00Z') })
    expect(rpc).toHaveBeenCalledWith('get_group_bills', { target_group_id: 'group-1', since: '2025-01-01T00:00:00.000Z' })
  })

  it('passes specific bill ids through for a per-bill update', async () => {
    const { supabase, rpc } = fakeSupabase({ data: [], error: null })
    await fetchGroupBills(supabase, 'group-1', { billIds: ['b1', 'b2'] })
    expect(rpc).toHaveBeenCalledWith('get_group_bills', { target_group_id: 'group-1', bill_ids: ['b1', 'b2'] })
  })

  it('treats a null response as an empty list', async () => {
    const { supabase } = fakeSupabase({ data: null, error: null })
    expect(await fetchGroupBills(supabase, 'group-1')).toEqual([])
  })

  it('throws the RPC error instead of returning an empty list', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { code: 'PGRST003', message: 'pool timeout' } })
    await expect(fetchGroupBills(supabase, 'group-1')).rejects.toMatchObject({ code: 'PGRST003' })
  })
})

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

  it('keeps each bill\'s totals to its own items and shares, across many bills', () => {
    const bills = [
      {
        id: 'b1',
        paid_by: 'alice',
        created_at: '2026-01-02T00:00:00Z',
        items: [
          { id: 'i1', total_price: 30, item_shares: [{ member_id: 'alice', shares: 1 }, { member_id: 'bob', shares: 2 }] },
          { id: 'i2', total_price: 6, item_shares: [{ member_id: 'bob', shares: 1 }] },
        ],
        bill_payers: [],
      },
      {
        id: 'b2',
        paid_by: 'bob',
        created_at: '2026-01-01T00:00:00Z',
        items: [{ id: 'i3', total_price: 8, item_shares: [{ member_id: 'alice', shares: 1 }] }],
        bill_payers: [],
      },
      { id: 'b3', paid_by: 'alice', created_at: '2026-01-01T00:00:00Z', items: [], bill_payers: [] },
    ]
    const { billPersonalTotals } = computeGroupViewSnapshot(bills)
    expect(billPersonalTotals['b1'].alice).toEqual({ paid: 36, consumed: 10 })
    expect(billPersonalTotals['b1'].bob).toEqual({ paid: 0, consumed: 26 })
    expect(billPersonalTotals['b2'].alice).toEqual({ paid: 0, consumed: 8 })
    expect(billPersonalTotals['b2'].bob).toEqual({ paid: 8, consumed: 0 })
    expect(billPersonalTotals['b3']).toBeDefined()
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
