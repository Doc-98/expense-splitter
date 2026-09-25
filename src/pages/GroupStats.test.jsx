import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import GroupStats from './GroupStats'
import GroupGraphs from './GroupGraphs'
import { CurrencyProvider } from '../context/CurrencyContext'
import { groupStatsCache } from '../lib/groupStatsCache'
import { groupStatsSnapshotFromGroupView } from '../lib/groupStatsSnapshot'
import { setStatsPreferences } from '../lib/statsPreferences'

// Group Stats and Graphs: both paint straight from groupStatsCache (which
// the group page fills — see groupStatsSnapshot.js) and refresh through
// get_group_bills in the background. Bill titles are found as Stats'
// "Biggest bills" links (the printable recap repeats them as plain text).
const { mockFrom, mockRpc, mockNavigate, mockFetchAllGroupMembers } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockNavigate: vi.fn(),
  mockFetchAllGroupMembers: vi.fn(),
}))

vi.mock('../supabaseClient', () => ({ supabase: { from: mockFrom, rpc: mockRpc } }))
vi.mock('../lib/members', () => ({ fetchAllGroupMembers: mockFetchAllGroupMembers }))
vi.mock('../lib/categories', () => ({ fetchCategories: () => Promise.resolve([]) }))
vi.mock('react-router-dom', () => ({
  useParams: () => ({ groupId: 'group-1' }),
  useNavigate: () => mockNavigate,
  Link: ({ to, children, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

const MEMBERS = [
  { id: 'member-alice', userId: 'user-me', name: 'Alice', avatarIcon: null, isGuest: false, active: true },
  { id: 'member-bob', userId: 'user-bob', name: 'Bob', avatarIcon: null, isGuest: false, active: true },
]
const GROUP = { id: 'group-1', name: 'Beach Trip', is_personal: false, admin_id: 'member-alice' }

function makeBill(id, title, createdAt, price) {
  return {
    id,
    group_id: 'group-1',
    title,
    created_at: createdAt,
    paid_by: 'member-alice',
    category_id: null,
    items: [
      {
        id: `${id}-item`,
        total_price: price,
        category_id: null,
        item_shares: [
          { member_id: 'member-alice', shares: 1 },
          { member_id: 'member-bob', shares: 1 },
        ],
      },
    ],
    bill_payers: [],
  }
}

// One bill this month, one from years ago — outside the recent window a
// first visit fetches before the rest of the history.
const RECENT = makeBill('bill-recent', 'Groceries', new Date().toISOString(), '40.00')
const OLD = makeBill('bill-old', 'Old ski trip', '2019-02-01T10:00:00+00:00', '300.00')
let serverBills

function billRequests() {
  return mockRpc.mock.calls.filter(([fn]) => fn === 'get_group_bills').map(([, args]) => args)
}

beforeEach(() => {
  if (!document.getElementById('print-root')) {
    const printRoot = document.createElement('div')
    printRoot.id = 'print-root'
    document.body.appendChild(printRoot)
  }
  serverBills = [RECENT, OLD]
  mockRpc.mockReset().mockImplementation(async (fn, args) => {
    if (fn !== 'get_group_bills') throw new Error(`unexpected rpc: ${fn}`)
    const since = args.since ? new Date(args.since) : null
    return { data: serverBills.filter((b) => !since || new Date(b.created_at) >= since), error: null }
  })
  mockFrom.mockReset().mockImplementation((table) => {
    if (table !== 'groups') throw new Error(`unexpected table: ${table}`)
    return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: GROUP, error: null }) }) }) }
  })
  mockFetchAllGroupMembers.mockReset().mockResolvedValue(MEMBERS)
  mockNavigate.mockReset()
  groupStatsCache.clear()
  localStorage.clear()
  setStatsPreferences({ defaultGranularity: 'all' })
})

// What the group page leaves in the cache once its bill list has loaded.
function fillCacheLikeTheGroupPage(bills = [RECENT, OLD]) {
  groupStatsCache.set('group-1', groupStatsSnapshotFromGroupView({ group: GROUP, allMembers: MEMBERS, categories: [], bills }))
}

function renderPage(Page) {
  return render(
    <CurrencyProvider>
      <Page />
    </CurrencyProvider>
  )
}

describe('Group Stats', () => {
  it('shows the stats on its very first render when the group page has already been open', () => {
    fillCacheLikeTheGroupPage()
    renderPage(GroupStats)
    // No findBy/await: painted from the cache before any request resolves.
    expect(screen.getByRole('link', { name: 'Old ski trip' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Groceries' })).toBeInTheDocument()
    expect(screen.queryByText(/Still loading this group's full history/)).not.toBeInTheDocument()
  })

  it('refreshes the complete list in one request, never dropping older bills in between', async () => {
    fillCacheLikeTheGroupPage()
    renderPage(GroupStats)
    await waitFor(() => expect(billRequests()).toHaveLength(1))
    expect(billRequests()[0]).toEqual({ target_group_id: 'group-1' })
    await waitFor(() => expect(mockFetchAllGroupMembers).toHaveBeenCalled())
    expect(screen.getByRole('link', { name: 'Old ski trip' })).toBeInTheDocument()
  })

  it('picks up changes made since the cache was filled', async () => {
    fillCacheLikeTheGroupPage()
    serverBills = [RECENT, OLD, makeBill('bill-new', 'Pizza night', new Date().toISOString(), '25.00')]
    renderPage(GroupStats)
    expect(await screen.findByRole('link', { name: 'Pizza night' })).toBeInTheDocument()
  })

  it('with nothing cached, loads a recent window first, then the complete history', async () => {
    renderPage(GroupStats)
    expect(await screen.findByRole('link', { name: 'Old ski trip' })).toBeInTheDocument()
    const [first, second] = billRequests()
    expect(first.since).toBeDefined()
    expect(second).toEqual({ target_group_id: 'group-1' })
  })
})

describe('Group Graphs', () => {
  it("skips its loading state when the group page has already filled the cache", () => {
    fillCacheLikeTheGroupPage()
    renderPage(GroupGraphs)
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Graphs — Beach Trip' })).toBeInTheDocument()
  })

  it('refreshes the complete list in one request', async () => {
    fillCacheLikeTheGroupPage()
    renderPage(GroupGraphs)
    await waitFor(() => expect(billRequests()).toHaveLength(1))
    expect(billRequests()[0]).toEqual({ target_group_id: 'group-1' })
  })

  it('with nothing cached, shows its loading state and then the charts', async () => {
    renderPage(GroupGraphs)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Graphs — Beach Trip' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())
    await waitFor(() => expect(billRequests()).toHaveLength(2))
  })
})
