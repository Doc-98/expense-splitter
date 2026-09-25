// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { fetchGroupBalances, fetchGroupSettlement } from './groupBalances'

function fakeSupabase(rpcResult) {
  return { rpc: (fn, args) => Promise.resolve(rpcResult(fn, args)) }
}

describe('fetchGroupSettlement', () => {
  it('calls get_group_balances with the group id and simplifies the result', async () => {
    const supabase = fakeSupabase((fn, args) => {
      expect(fn).toBe('get_group_balances')
      expect(args).toEqual({ target_group_id: 'group-1' })
      return {
        data: [
          { member_id: 'alice', balance: '10.00' },
          { member_id: 'bob', balance: '-10.00' },
        ],
        error: null,
      }
    })
    const settlement = await fetchGroupSettlement(supabase, 'group-1')
    expect(settlement).toEqual([{ from: 'bob', to: 'alice', amount: 10 }])
  })

  it('converts string balances to numbers (Supabase returns numeric columns as strings)', async () => {
    // A raw string '10.00' concatenated instead of added would produce a
    // nonsense result here — this only passes if the values actually went
    // through Number(...) before reaching simplifyDebts().
    const supabase = fakeSupabase(() => ({
      data: [
        { member_id: 'alice', balance: '2.50' },
        { member_id: 'bob', balance: '-2.50' },
      ],
      error: null,
    }))
    const settlement = await fetchGroupSettlement(supabase, 'group-1')
    expect(settlement).toEqual([{ from: 'bob', to: 'alice', amount: 2.5 }])
  })

  it('returns an empty settlement when nobody has a balance', async () => {
    const supabase = fakeSupabase(() => ({ data: [], error: null }))
    expect(await fetchGroupSettlement(supabase, 'group-1')).toEqual([])
  })

  it('treats a null data response the same as empty, rather than throwing', async () => {
    const supabase = fakeSupabase(() => ({ data: null, error: null }))
    expect(await fetchGroupSettlement(supabase, 'group-1')).toEqual([])
  })

  it('throws the RPC error rather than silently returning an empty settlement', async () => {
    const supabase = fakeSupabase(() => ({ data: null, error: new Error('network down') }))
    await expect(fetchGroupSettlement(supabase, 'group-1')).rejects.toThrow('network down')
  })
})

describe('fetchGroupBalances', () => {
  it("returns each member's balance as a number", async () => {
    const supabase = fakeSupabase(() => ({
      data: [
        { member_id: 'alice', balance: '12.50' },
        { member_id: 'bob', balance: '-12.50' },
      ],
      error: null,
    }))
    expect(await fetchGroupBalances(supabase, 'group-1')).toEqual({ alice: 12.5, bob: -12.5 })
  })

  it('throws when the RPC fails', async () => {
    const supabase = fakeSupabase(() => ({ data: null, error: { message: 'boom' } }))
    await expect(fetchGroupBalances(supabase, 'group-1')).rejects.toEqual({ message: 'boom' })
  })
})
