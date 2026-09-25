import { describe, expect, it } from 'vitest'
import { groupStatsSnapshotFromGroupView, statsRawFromBills, toWindowStart } from './groupStatsSnapshot'
import { getStatsWindowStart } from './timeRange'

// One bill exactly as get_group_bills returns it (to_jsonb of the row, plus
// nested items/item_shares/bill_payers).
const BILL = {
  id: 'bill-1',
  group_id: 'group-1',
  title: 'Dinner',
  note: 'birthday',
  created_at: '2026-09-20T20:00:00+00:00',
  created_by: 'user-me',
  paid_by: 'member-alice',
  category_id: 'cat-food',
  items: [
    {
      id: 'item-1',
      total_price: '30.00',
      category_id: null,
      item_shares: [
        { member_id: 'member-alice', shares: 1 },
        { member_id: 'member-bob', shares: 2 },
      ],
    },
  ],
  bill_payers: [{ member_id: 'member-alice', amount: '30.00' }],
}

describe('statsRawFromBills', () => {
  it('flattens bills into the rawBills/rawItems/rawShares the stats pages compute from', () => {
    expect(statsRawFromBills([BILL])).toEqual({
      rawBills: [
        {
          id: 'bill-1',
          title: 'Dinner',
          created_at: '2026-09-20T20:00:00+00:00',
          paid_by: 'member-alice',
          payers: [{ member_id: 'member-alice', amount: '30.00' }],
          category_id: 'cat-food',
        },
      ],
      rawItems: [{ id: 'item-1', bill_id: 'bill-1', total_price: '30.00', category_id: null }],
      rawShares: [
        { item_id: 'item-1', user_id: 'member-alice', shares: 1 },
        { item_id: 'item-1', user_id: 'member-bob', shares: 2 },
      ],
    })
  })
})

describe('groupStatsSnapshotFromGroupView', () => {
  it("builds a complete stats cache entry from the group page's own state", () => {
    const members = [{ id: 'member-alice', name: 'Alice' }]
    const categories = [{ id: 'cat-food', name: 'Food' }]
    const snapshot = groupStatsSnapshotFromGroupView({
      group: { id: 'group-1', name: 'Casa', is_personal: false, admin_id: 'member-alice' },
      allMembers: members,
      categories,
      bills: [BILL],
    })

    expect(snapshot).toEqual({
      groupName: 'Casa',
      isPersonal: false,
      members,
      categories,
      ...statsRawFromBills([BILL]),
      historyStatus: 'complete',
      historyWindowStart: getStatsWindowStart(),
    })
  })
})

describe('toWindowStart', () => {
  it('turns the ISO string a sessionStorage round-trip leaves behind back into a Date', () => {
    const start = new Date('2025-01-01T00:00:00.000Z')
    const revived = toWindowStart(JSON.parse(JSON.stringify(start)))
    expect(revived).toBeInstanceOf(Date)
    expect(revived.getTime()).toBe(start.getTime())
    expect(new Date('2025-06-01') >= revived).toBe(true)
  })

  it('keeps a Date as-is and null as null', () => {
    const start = new Date('2025-01-01T00:00:00.000Z')
    expect(toWindowStart(start).getTime()).toBe(start.getTime())
    expect(toWindowStart(null)).toBeNull()
  })
})
