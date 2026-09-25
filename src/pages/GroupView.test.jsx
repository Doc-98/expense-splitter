import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GroupView from './GroupView'
import { CurrencyProvider } from '../context/CurrencyContext'
import { groupViewCache } from '../lib/groupViewCache'

// The page's realtime/patching glue, end to end: the real GroupView, the real
// runners, relevance tracking, patch planning and patch merging — only the
// network is faked. The server side is a small in-memory bill table that
// get_group_bills reads from (same filtering and ordering as the SQL), and
// the realtime channel is captured so tests can fire events and connection
// statuses at the page the way Supabase would. What's asserted is what
// matters in production: which requests the page makes, and what it shows.
const { mockFrom, mockRpc, mockChannel, mockRemoveChannel, mockNavigate, mockFetchAllGroupMembers } = vi.hoisted(
  () => ({
    mockFrom: vi.fn(),
    mockRpc: vi.fn(),
    mockChannel: vi.fn(),
    mockRemoveChannel: vi.fn(),
    mockNavigate: vi.fn(),
    mockFetchAllGroupMembers: vi.fn(),
  })
)

vi.mock('../supabaseClient', () => ({
  supabase: { from: mockFrom, rpc: mockRpc, channel: mockChannel, removeChannel: mockRemoveChannel },
}))
vi.mock('../lib/members', () => ({ fetchAllGroupMembers: mockFetchAllGroupMembers }))
vi.mock('../lib/categories', () => ({ fetchCategories: () => Promise.resolve([]) }))
vi.mock('../lib/recurringBills', () => ({ processDueRecurringBills: () => Promise.resolve({ created: 0 }) }))
vi.mock('../lib/prefetchGroupSettings', () => ({ prefetchGroupSettings: () => {} }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-me' } }) }))
vi.mock('react-router-dom', () => ({
  useParams: () => ({ groupId: 'group-1' }),
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/groups/group-1', state: null }),
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

function makeItem(id, price) {
  return {
    id,
    total_price: price,
    category_id: null,
    item_shares: [
      { member_id: 'member-alice', shares: 1 },
      { member_id: 'member-bob', shares: 1 },
    ],
  }
}

function makeBill(id, title, createdAt, items = []) {
  return {
    id,
    group_id: 'group-1',
    title,
    note: null,
    created_at: createdAt,
    created_by: 'user-me',
    paid_by: 'member-alice',
    items,
    bill_payers: [],
  }
}

// The "database": what get_group_bills reads. Tests change it directly, then
// fire the realtime event that change would have produced (or deliberately
// don't, to simulate a missed one).
let server
// Set to an error to make the next per-bill fetch fail.
let nextPatchError
// Set to an error to make the next full-list fetch fail.
let nextFullError
// Set to a promise to hold full-list responses until it resolves.
let holdFullLoads
// The captured realtime channel: one handler per table, plus the status
// callback passed to subscribe().
let handlers
let onStatus

function getGroupBills({ bill_ids }) {
  let list = [...server.values()]
  if (bill_ids) list = list.filter((b) => bill_ids.includes(b.id))
  list.sort((a, b) => b.created_at.localeCompare(a.created_at) || (a.id < b.id ? 1 : -1))
  return { data: JSON.parse(JSON.stringify(list)), error: null }
}

function billsTable() {
  return {
    delete: () => ({
      eq: (_col, id) => {
        server.delete(id)
        return Promise.resolve({ error: null })
      },
    }),
  }
}

function groupsTable() {
  const group = { id: 'group-1', name: 'Beach Trip', admin_id: 'member-alice', is_personal: false }
  return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: group, error: null }) }) }) }
}

function makeChannel() {
  const channel = {
    on: vi.fn((_type, filter, handler) => {
      handlers[filter.table] = handler
      return channel
    }),
    subscribe: vi.fn((callback) => {
      onStatus = callback
      return channel
    }),
  }
  return channel
}

// Every get_group_bills request the page made, by kind.
function billRequests() {
  return mockRpc.mock.calls.filter(([fn]) => fn === 'get_group_bills').map(([, args]) => args)
}
const fullLoads = () => billRequests().filter((args) => !args.bill_ids && !args.since)
const patchLoads = () => billRequests().filter((args) => args.bill_ids)

// Lets the runners' debounce (300ms) and any fetches behind it finish.
async function settle(ms = 1000) {
  await act(() => vi.advanceTimersByTimeAsync(ms))
}

function fire(table, eventType, row) {
  act(() => {
    handlers[table](eventType === 'DELETE' ? { eventType, old: row, new: {} } : { eventType, new: row, old: {} })
  })
}

// Renders the page, waits for the complete list, then forgets the requests
// made so far — so each test only sees the ones its own action caused.
async function renderLoaded() {
  render(
    <CurrencyProvider>
      <GroupView />
    </CurrencyProvider>
  )
  act(() => onStatus('SUBSCRIBED')) // the initial join
  await screen.findByText('Dinner')
  await waitFor(() => expect(fullLoads()).toHaveLength(1))
  await settle()
  mockRpc.mockClear()
  mockFetchAllGroupMembers.mockClear()
}

beforeEach(() => {
  // index.html's print target, which the printable recap portals into.
  if (!document.getElementById('print-root')) {
    const printRoot = document.createElement('div')
    printRoot.id = 'print-root'
    document.body.appendChild(printRoot)
  }
  vi.useFakeTimers({ shouldAdvanceTime: true })
  server = new Map(
    [
      makeBill('bill-a', 'Dinner', '2026-09-20T20:00:00.000001+00:00', [makeItem('item-a1', 30), makeItem('item-a2', 10)]),
      makeBill('bill-b', 'Groceries', '2026-09-19T10:00:00+00:00', [makeItem('item-b1', 42)]),
      makeBill('bill-c', 'Taxi', '2026-09-18T08:00:00+00:00', [makeItem('item-c1', 18)]),
    ].map((b) => [b.id, b])
  )
  nextPatchError = null
  nextFullError = null
  holdFullLoads = null
  handlers = {}
  onStatus = null
  mockRpc.mockReset().mockImplementation(async (fn, args) => {
    if (fn === 'get_group_balances') return { data: [], error: null }
    if (fn !== 'get_group_bills') throw new Error(`unexpected rpc: ${fn}`)
    if (args.bill_ids && nextPatchError) {
      const error = nextPatchError
      nextPatchError = null
      return { data: null, error }
    }
    if (!args.bill_ids && !args.since) {
      if (holdFullLoads) await holdFullLoads
      if (nextFullError) {
        const error = nextFullError
        nextFullError = null
        return { data: null, error }
      }
    }
    return getGroupBills(args)
  })
  mockFrom.mockReset().mockImplementation((table) => {
    if (table === 'groups') return groupsTable()
    if (table === 'bills') return billsTable()
    throw new Error(`unexpected table: ${table}`)
  })
  mockFetchAllGroupMembers.mockReset().mockResolvedValue(MEMBERS)
  mockChannel.mockReset().mockImplementation(() => makeChannel())
  mockRemoveChannel.mockReset()
  mockNavigate.mockReset()
  groupViewCache.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function billTitles() {
  return Array.from(document.querySelectorAll('.card-list-item-title')).map((el) => el.textContent)
}

describe('GroupView — loading', () => {
  it('loads the complete list once and shows it newest first', async () => {
    await renderLoaded()
    expect(billTitles()).toEqual(['Dinner', 'Groceries', 'Taxi'])
  })

  it('reloads the whole list for an event that arrives before the first load finished', async () => {
    let release
    holdFullLoads = new Promise((resolve) => (release = resolve))
    render(
      <CurrencyProvider>
        <GroupView />
      </CurrencyProvider>
    )
    // Nothing learned yet, so the page can't tell which bill this is.
    server.get('bill-b').items.push(makeItem('item-b2', 5))
    fire('items', 'INSERT', { id: 'item-b2', bill_id: 'bill-b' })
    release()
    holdFullLoads = null
    await settle()

    expect(fullLoads()).toHaveLength(2)
    expect(patchLoads()).toHaveLength(0)
  })
})

describe('GroupView — realtime changes patch just the affected bill', () => {
  it('re-fetches only the bill an item change belongs to', async () => {
    await renderLoaded()

    server.get('bill-b').items.push(makeItem('item-b2', 5))
    fire('items', 'INSERT', { id: 'item-b2', bill_id: 'bill-b' })
    await settle()

    expect(patchLoads()).toEqual([expect.objectContaining({ target_group_id: 'group-1', bill_ids: ['bill-b'] })])
    expect(fullLoads()).toHaveLength(0)
  })

  it('turns a burst of events (one per row, as after a scan) into one request', async () => {
    await renderLoaded()

    fire('items', 'UPDATE', { id: 'item-a1', bill_id: 'bill-a' })
    fire('item_shares', 'DELETE', { item_id: 'item-a1', member_id: 'member-bob' })
    fire('item_shares', 'INSERT', { item_id: 'item-a2', member_id: 'member-bob' })
    fire('items', 'DELETE', { id: 'item-c1' })
    await settle()

    expect(patchLoads()).toHaveLength(1)
    expect([...patchLoads()[0].bill_ids].sort()).toEqual(['bill-a', 'bill-c'])
    expect(fullLoads()).toHaveLength(0)
  })

  it('shows a renamed bill after its update event', async () => {
    await renderLoaded()

    server.get('bill-c').title = 'Airport taxi'
    fire('bills', 'UPDATE', { id: 'bill-c', group_id: 'group-1' })
    await settle()

    expect(billTitles()).toEqual(['Dinner', 'Groceries', 'Airport taxi'])
    expect(fullLoads()).toHaveLength(0)
  })

  it('adds a new bill in the right place', async () => {
    await renderLoaded()

    server.set('bill-d', makeBill('bill-d', 'Museum', '2026-09-19T12:00:00+00:00'))
    fire('bills', 'INSERT', { id: 'bill-d', group_id: 'group-1' })
    await settle()

    expect(billTitles()).toEqual(['Dinner', 'Museum', 'Groceries', 'Taxi'])
    expect(patchLoads()).toEqual([expect.objectContaining({ bill_ids: ['bill-d'] })])
  })

  it('removes a bill deleted elsewhere', async () => {
    await renderLoaded()

    server.delete('bill-b')
    fire('bills', 'DELETE', { id: 'bill-b' })
    await settle()

    expect(billTitles()).toEqual(['Dinner', 'Taxi'])
    expect(patchLoads()).toEqual([expect.objectContaining({ bill_ids: ['bill-b'] })])
    expect(fullLoads()).toHaveLength(0)
  })

  it("ignores item changes from the user's other groups", async () => {
    await renderLoaded()

    fire('items', 'INSERT', { id: 'item-x1', bill_id: 'bill-in-another-group' })
    fire('items', 'DELETE', { id: 'item-x1' })
    fire('item_shares', 'INSERT', { item_id: 'item-x1', member_id: 'member-zed' })
    fire('bills', 'DELETE', { id: 'bill-in-another-group' })
    await settle()

    expect(billRequests()).toHaveLength(0)
  })

  it('reloads the whole list when too many bills changed at once', async () => {
    await renderLoaded()

    for (let i = 0; i < 21; i++) {
      const id = `bill-new-${String(i).padStart(2, '0')}`
      server.set(id, makeBill(id, `Imported ${i}`, `2026-09-10T10:00:${String(i).padStart(2, '0')}+00:00`))
      fire('bills', 'INSERT', { id, group_id: 'group-1' })
    }
    await settle()

    expect(fullLoads()).toHaveLength(1)
    expect(patchLoads()).toHaveLength(0)
  })

  it('falls back to a full reload when a patch request fails', async () => {
    await renderLoaded()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    nextPatchError = { code: 'PGRST003', message: 'Timed out acquiring connection from connection pool.' }
    server.get('bill-a').title = 'Late dinner'
    fire('bills', 'UPDATE', { id: 'bill-a', group_id: 'group-1' })
    await settle()

    expect(patchLoads()).toHaveLength(1)
    expect(fullLoads()).toHaveLength(1)
    expect(billTitles()).toEqual(['Late dinner', 'Groceries', 'Taxi'])
    expect(consoleError).toHaveBeenCalledWith('Bill patch failed, reloading the whole list instead:', expect.anything())
  })
})

describe("GroupView — the page's own edits", () => {
  it('deleting a bill re-fetches just that bill, straight away', async () => {
    await renderLoaded()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    await user.click(screen.getByRole('button', { name: 'Actions for Groceries' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(billTitles()).toEqual(['Dinner', 'Taxi']))
    expect(patchLoads()).toEqual([expect.objectContaining({ bill_ids: ['bill-b'] })])
    expect(fullLoads()).toHaveLength(0)
  })
})

describe('GroupView — patches only ever build on the complete list', () => {
  it('reloads in full, not patches, while only the first-paint preview has loaded', async () => {
    nextFullError = { code: 'PGRST003', message: 'Timed out acquiring connection from connection pool.' }
    render(
      <CurrencyProvider>
        <GroupView />
      </CurrencyProvider>
    )
    // The windowed first-paint list is on screen, the complete one failed.
    await screen.findByText(/Couldn't load this group's bills/)
    await screen.findByText('Groceries')
    mockRpc.mockClear()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    await user.click(screen.getByRole('button', { name: 'Actions for Groceries' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(billTitles()).toEqual(['Dinner', 'Taxi']))
    expect(fullLoads()).toHaveLength(1)
    expect(patchLoads()).toHaveLength(0)
  })
})

describe('GroupView — catching up on missed changes', () => {
  it('reloads everything after the realtime connection rejoins', async () => {
    await renderLoaded()

    // Changed while disconnected: no event ever arrives for it.
    server.get('bill-c').title = 'Airport taxi'
    act(() => onStatus('SUBSCRIBED'))
    await settle()

    expect(fullLoads()).toHaveLength(1)
    expect(mockFetchAllGroupMembers).toHaveBeenCalled()
    expect(billTitles()).toEqual(['Dinner', 'Groceries', 'Airport taxi'])
  })
})

describe('GroupView — verification after patching', () => {
  it('checks the patched list against a full reload ~30s later, silently when they agree', async () => {
    await renderLoaded()
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    server.get('bill-a').items.pop()
    fire('items', 'DELETE', { id: 'item-a2' })
    await settle()
    expect(fullLoads()).toHaveLength(0)

    await settle(30 * 1000)

    expect(fullLoads()).toHaveLength(1)
    expect(consoleWarn).not.toHaveBeenCalled()
  })

  it('logs and corrects a patched list that drifted from the server', async () => {
    await renderLoaded()
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    server.get('bill-a').items.pop()
    fire('items', 'DELETE', { id: 'item-a2' })
    await settle()
    // A change the page never heard about, standing in for a patching bug.
    server.get('bill-b').title = 'Supermarket'
    await settle(30 * 1000)

    expect(consoleWarn).toHaveBeenCalledWith(
      '[bill patches] patched list differed from a full reload; corrected. Bills:',
      ['bill-b']
    )
    expect(billTitles()).toEqual(['Dinner', 'Supermarket', 'Taxi'])
  })

  it('waits for a quiet stretch — each new patch pushes the check back', async () => {
    await renderLoaded()

    fire('items', 'UPDATE', { id: 'item-a1', bill_id: 'bill-a' })
    await settle(20 * 1000)
    fire('items', 'UPDATE', { id: 'item-b1', bill_id: 'bill-b' })
    await settle(20 * 1000)
    expect(fullLoads()).toHaveLength(0)

    await settle(15 * 1000)
    expect(fullLoads()).toHaveLength(1)
  })
})
