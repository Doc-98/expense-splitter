import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import GroupBudgetsSection from './GroupBudgetsSection'
import { CurrencyProvider } from '../context/CurrencyContext'

const { mockFrom, mockFetchThresholds, mockFetchBillsForGroups } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockFetchThresholds: vi.fn(),
  mockFetchBillsForGroups: vi.fn(),
}))

vi.mock('../supabaseClient', () => ({ supabase: { from: mockFrom } }))
vi.mock('../lib/thresholds', () => ({ fetchThresholds: mockFetchThresholds }))
vi.mock('../lib/groupViewSnapshot', () => ({ fetchBillsForGroups: mockFetchBillsForGroups }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-me' } }) }))

// I'm in two groups (as a different member in each); both have a
// Groceries tag, only the beach trip has Going out.
const MEMBERSHIPS = [
  { id: 'me-beach', group_id: 'beach' },
  { id: 'me-flat', group_id: 'flat' },
]
const CATEGORIES = [
  { id: 'beach-food', name: 'Groceries', color: '#534195', group_id: 'beach' },
  { id: 'beach-fun', name: 'Going out', color: '#c77510', group_id: 'beach' },
  { id: 'flat-food', name: 'groceries', color: '#534195', group_id: 'flat' },
]

function bill(id, groupId, date, price, categoryId, sharers) {
  return {
    id,
    group_id: groupId,
    title: id,
    created_at: new Date(`${date}T12:00:00`).toISOString(),
    paid_by: sharers[0],
    category_id: categoryId,
    items: [
      {
        id: `${id}-item`,
        total_price: price,
        category_id: null,
        item_shares: sharers.map((member_id) => ({ member_id, shares: 1 })),
      },
    ],
    bill_payers: [],
  }
}

let snapshots
function chain(result) {
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
  return query
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 15, 12)) // Thursday 15 October 2026
  snapshots = []
  mockFrom.mockReset().mockImplementation((table) => {
    if (table === 'group_members') return chain({ data: MEMBERSHIPS, error: null })
    if (table === 'departure_snapshots') return chain({ data: snapshots, error: null })
    if (table === 'categories') return chain({ data: CATEGORIES, error: null })
    throw new Error(`unexpected table: ${table}`)
  })
  mockFetchThresholds.mockReset().mockResolvedValue([
    { category_name: 'Groceries', amount: 100 },
    { category_name: 'Transport', amount: 50 }, // no such tag in this group
  ])
  mockFetchBillsForGroups.mockReset().mockResolvedValue([
    bill('beach-shop', 'beach', '2026-10-03', '60.00', 'beach-food', ['me-beach', 'friend']), // my half: 30
    bill('flat-shop', 'flat', '2026-10-10', '90.00', 'flat-food', ['me-flat']), // 90
  ])
})
afterEach(() => vi.useRealTimers())

function renderSection(props = {}) {
  return render(
    <CurrencyProvider>
      <GroupBudgetsSection groupId="beach" budgetPeriod="month" {...props} />
    </CurrencyProvider>
  )
}

describe('GroupBudgetsSection', () => {
  it("shows this group's budgets measured across every group, and how much was spent here", async () => {
    renderSection()
    expect(await screen.findByText('Your budgets')).toBeInTheDocument()
    // 30 here + 90 in the flat = 120 of a 100 cap: over.
    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText(/120/)).toBeInTheDocument()
    expect(screen.getByText(/30.* in this group/)).toBeInTheDocument()
    expect(screen.queryByText('Transport')).not.toBeInTheDocument()
    // Only this month of bills is asked for.
    expect(mockFetchBillsForGroups.mock.calls[0][1]).toEqual(['beach', 'flat'])
    expect(mockFetchBillsForGroups.mock.calls[0][2].since).toEqual(new Date(2026, 9, 1))
  })

  it('counts groups you have left too', async () => {
    snapshots = [
      { group_id: 'old', daily_totals: { '2026-10-05': { paid: 5, consumed: 5, categories: { Groceries: 5 } } } },
    ]
    renderSection()
    expect(await screen.findByText(/125/)).toBeInTheDocument()
  })

  it('shows nothing, and loads nothing more, without any budgets', async () => {
    mockFetchThresholds.mockResolvedValue([])
    const { container } = renderSection()
    await vi.waitFor(() => expect(mockFetchThresholds).toHaveBeenCalled())
    await Promise.resolve()
    expect(container).toBeEmptyDOMElement()
    expect(mockFrom).not.toHaveBeenCalled()
  })
})
