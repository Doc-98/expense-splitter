// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { snapshotAndRemoveMember } from './leaveGroup'

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))
vi.mock('../supabaseClient', () => ({ supabase: { rpc: mockRpc } }))

// Alice paid €30 for a dinner split evenly with Bob, in the "food" category.
const BILLS = [
  {
    id: 'bill-1',
    group_id: 'group-1',
    title: 'Dinner',
    created_at: '2026-09-20T12:00:00',
    paid_by: 'member-alice',
    category_id: 'cat-food',
    items: [
      {
        id: 'item-1',
        total_price: '30.00',
        category_id: null,
        item_shares: [
          { member_id: 'member-alice', shares: 1 },
          { member_id: 'member-bob', shares: 1 },
        ],
      },
    ],
    bill_payers: [],
  },
]

let removeResult

beforeEach(() => {
  removeResult = { error: null }
  mockRpc.mockReset().mockImplementation(async (fn) => {
    if (fn === 'get_group_bills') return { data: BILLS, error: null }
    if (fn === 'get_group_balances')
      return {
        data: [
          { member_id: 'member-alice', balance: '15.00' },
          { member_id: 'member-bob', balance: '-15.00' },
        ],
        error: null,
      }
    if (fn === 'remove_group_member') return removeResult
    throw new Error(`unexpected rpc: ${fn}`)
  })
})

const leaveAsBob = () =>
  snapshotAndRemoveMember({
    groupId: 'group-1',
    groupName: 'Casa',
    member: { id: 'member-bob', userId: 'user-bob' },
    categories: [{ id: 'cat-food', name: 'Food' }],
  })

describe('snapshotAndRemoveMember', () => {
  it("freezes the server's balance and the member's own daily spending, then removes them", async () => {
    await leaveAsBob()

    // The complete bill list, not a (row-capped) plain select.
    expect(mockRpc).toHaveBeenCalledWith('get_group_bills', { target_group_id: 'group-1' })
    expect(mockRpc).toHaveBeenCalledWith('remove_group_member', {
      target_group_id: 'group-1',
      target_user_id: 'user-bob',
      group_name: 'Casa',
      snapshot_balance: -15,
      snapshot_daily: { '2026-09-20': { paid: 0, consumed: 15, categories: { Food: 15 } } },
    })
  })

  it('throws, without removing anyone, when the history or balance fetch fails', async () => {
    mockRpc.mockImplementation(async (fn) =>
      fn === 'get_group_balances' ? { data: null, error: { message: 'timeout' } } : { data: BILLS, error: null }
    )
    await expect(leaveAsBob()).rejects.toBeTruthy()
    expect(mockRpc).not.toHaveBeenCalledWith('remove_group_member', expect.anything())
  })

  it('throws when the removal itself fails', async () => {
    removeResult = { error: { message: 'Only the group admin can remove other members' } }
    await expect(leaveAsBob()).rejects.toThrow('Only the group admin can remove other members')
  })
})
