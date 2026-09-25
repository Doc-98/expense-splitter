import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import AccountStats from './AccountStats'
import { CurrencyProvider } from '../context/CurrencyContext'
import { accountStatsCache } from '../lib/accountStatsCache'

// Your Stats across two groups plus one group already left: the overall
// balance comes from each group's server-computed balance plus the unsettled
// frozen one, and bills come from get_group_bills, one call per group.
const { mockFrom, mockRpc } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockRpc: vi.fn() }))

vi.mock('../supabaseClient', () => ({ supabase: { from: mockFrom, rpc: mockRpc } }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-me' } }) }))
vi.mock('../lib/thresholds', () => ({ fetchThresholds: () => Promise.resolve([]) }))
vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

// A thenable query chain resolving to `result`, whatever filters are chained.
function query(result) {
  const chain = new Proxy(
    {},
    {
      get: (_target, prop) => (prop === 'then' ? (resolve, reject) => Promise.resolve(result).then(resolve, reject) : () => chain),
    }
  )
  return chain
}

const TABLES = {
  group_members: {
    data: [
      { id: 'me-in-g1', group_id: 'g1' },
      { id: 'me-in-g2', group_id: 'g2' },
    ],
    error: null,
  },
  departure_snapshots: {
    data: [{ group_id: 'g-old', group_name: 'Old flat', balance: '-3.00', balance_settled: false, daily_totals: {} }],
    error: null,
  },
  groups: {
    data: [
      { id: 'g1', name: 'Casa' },
      { id: 'g2', name: 'Trip' },
    ],
    error: null,
  },
  categories: { data: [], error: null },
}

const BALANCES = {
  g1: [
    { member_id: 'me-in-g1', balance: '20.50' },
    { member_id: 'someone', balance: '-20.50' },
  ],
  g2: [{ member_id: 'me-in-g2', balance: '-5.25' }],
}

function billRequests() {
  return mockRpc.mock.calls.filter(([fn]) => fn === 'get_group_bills').map(([, args]) => args)
}

beforeEach(() => {
  if (!document.getElementById('print-root')) {
    const printRoot = document.createElement('div')
    printRoot.id = 'print-root'
    document.body.appendChild(printRoot)
  }
  mockFrom.mockReset().mockImplementation((table) => {
    if (!TABLES[table]) throw new Error(`unexpected table: ${table}`)
    return query(TABLES[table])
  })
  mockRpc.mockReset().mockImplementation(async (fn, args) => {
    if (fn === 'get_group_balances') return { data: BALANCES[args.target_group_id], error: null }
    if (fn === 'get_group_bills') return { data: [], error: null }
    throw new Error(`unexpected rpc: ${fn}`)
  })
  accountStatsCache.clear()
  localStorage.clear()
})

function renderPage() {
  return render(
    <CurrencyProvider>
      <AccountStats />
    </CurrencyProvider>
  )
}

describe('Your Stats', () => {
  it("shows the overall balance from each group's server balance plus unsettled balances from groups left", async () => {
    renderPage()
    // 20.50 - 5.25 - 3.00
    expect(await screen.findByText('+€12.25', { selector: '.stats-summary-value' })).toBeInTheDocument()
    expect(mockRpc).toHaveBeenCalledWith('get_group_balances', { target_group_id: 'g1' })
    expect(mockRpc).toHaveBeenCalledWith('get_group_balances', { target_group_id: 'g2' })
    // No more downloading every payment to recompute it on the phone.
    expect(mockFrom).not.toHaveBeenCalledWith('payments')
  })

  it("loads each group's bills through get_group_bills: a recent window, then the complete history", async () => {
    renderPage()
    await waitFor(() => expect(billRequests()).toHaveLength(4))
    const [windowed, complete] = [billRequests().slice(0, 2), billRequests().slice(2)]
    expect(windowed.map((a) => a.target_group_id).sort()).toEqual(['g1', 'g2'])
    expect(windowed.every((a) => a.since)).toBe(true)
    expect(complete).toEqual([{ target_group_id: 'g1' }, { target_group_id: 'g2' }])
    expect(mockFrom).not.toHaveBeenCalledWith('bills')
  })

  it('fetches the complete history in one go when it was already complete last visit', async () => {
    accountStatsCache.set('user-me', {
      groups: TABLES.groups.data,
      myParticipantByGroup: new Map(),
      rawBills: [],
      rawItems: [],
      rawShares: [],
      rawCategories: [],
      thresholds: [],
      snapshots: [],
      overallBalance: 0,
      historyStatus: 'complete',
      historyWindowStart: new Date('2025-01-01').toISOString(),
    })
    renderPage()
    expect(await screen.findByText('+€12.25', { selector: '.stats-summary-value' })).toBeInTheDocument()
    await waitFor(() => expect(billRequests()).toHaveLength(2))
    expect(billRequests().every((a) => !a.since)).toBe(true)
  })
})
