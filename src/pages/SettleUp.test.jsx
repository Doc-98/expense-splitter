import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettleUp from './SettleUp'
import { CurrencyProvider } from '../context/CurrencyContext'
import { groupViewCache } from '../lib/groupViewCache'

// Same vi.hoisted() reasoning as every other Supabase-coupled suite —
// vi.mock() factories are hoisted above ordinary variable declarations.
const {
  mockFrom,
  mockRpc,
  mockPaymentsInsert,
  mockFetchAllGroupMembers,
  mockChannel,
  mockRemoveChannel,
  mockNavigate,
} = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockPaymentsInsert: vi.fn(),
  mockFetchAllGroupMembers: vi.fn(),
  mockChannel: vi.fn(),
  mockRemoveChannel: vi.fn(),
  mockNavigate: vi.fn(),
}))

// This page combines a query chain it builds itself (groups, plus the
// get_group_balances RPC — see groupsTable()/rpcResult below) with a lib
// function for members (fetchAllGroupMembers, same boundary
// RecordPayment.test.jsx already mocks) — the same combined shape as that
// page, plus a realtime subscription (supabase.channel()/removeChannel())
// neither of the earlier pages needed. CurrencyContext is wrapped for
// real, same reasoning as ItemRow.test.jsx/MultiPayerModal.test.jsx — it
// never touches Supabase or any browser API beyond localStorage.
vi.mock('../supabaseClient', () => ({
  supabase: { from: mockFrom, rpc: mockRpc, channel: mockChannel, removeChannel: mockRemoveChannel },
}))
vi.mock('../lib/members', () => ({ fetchAllGroupMembers: mockFetchAllGroupMembers }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-me' } }) }))
vi.mock('react-router-dom', () => ({
  useParams: () => ({ groupId: 'group-1' }),
  useNavigate: () => mockNavigate,
  Link: ({ to, children, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

function groupsTable() {
  return { select: () => ({ eq: () => ({ single: () => Promise.resolve(groupsSelectResult) }) }) }
}
function paymentsTable() {
  return { insert: mockPaymentsInsert }
}
function makeChannel() {
  const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) }
  return channel
}

function renderPage() {
  return render(
    <CurrencyProvider>
      <SettleUp />
    </CurrencyProvider>
  )
}

// The fixture balances route every debt through Carol (she's the sole
// debtor either way — owing Alice in "mine", owing Bob in "others"), so a
// plain `getByText('Carol')` matches both lists at once whenever both
// render.
// Scoped to the "mine" list specifically, the same way `.creditor`
// scoping already disambiguates the "others" side via Bob's name.
function findMineDebtor() {
  return screen.findByText('Carol', { selector: '.settle-your-debts .debtor' })
}

let groupsSelectResult
let rpcResult

const MEMBERS = [
  { id: 'member-alice', userId: 'user-me', name: 'Alice', avatarIcon: null, isGuest: false, active: true },
  { id: 'member-bob', userId: 'user-bob', name: 'Bob', avatarIcon: null, isGuest: false, active: true },
  { id: 'member-carol', userId: 'user-carol', name: 'Carol', avatarIcon: null, isGuest: false, active: true },
]

// Balances exactly as get_group_balances would return them for: Alice
// fronts €20 split evenly with Bob (Alice +10, Bob -10), Bob fronts €30
// split evenly with Carol (Bob +15, Carol -15) — net Alice +10, Bob +5,
// Carol -15. Supplied as raw balance rows (not bills/items — this page no
// longer fetches those at all) so simplifyDebts() itself, real and
// unmocked, is what turns this into "Carol owes Alice €10, Carol owes Bob
// €5" (its own greedy pairing, biggest creditor first) — same "real,
// unmocked settlement math" testing philosophy this suite already used
// before the balance moved server-side, just starting one step later in
// the pipeline. Amounts are strings, matching how Supabase actually
// returns a numeric column — exercises fetchGroupSettlement's own
// Number(...) conversion rather than sidestepping it.
function balancesFixture() {
  return [
    { member_id: 'member-alice', balance: '10.00' },
    { member_id: 'member-bob', balance: '5.00' },
    { member_id: 'member-carol', balance: '-15.00' },
  ]
}

beforeEach(() => {
  groupsSelectResult = { data: { id: 'group-1', name: 'Beach Trip' }, error: null }
  rpcResult = { data: balancesFixture(), error: null }
  mockFrom.mockReset().mockImplementation((table) => {
    if (table === 'groups') return groupsTable()
    if (table === 'payments') return paymentsTable()
    throw new Error(`unexpected table: ${table}`)
  })
  mockRpc.mockReset().mockImplementation((fn) => {
    if (fn === 'get_group_balances') return Promise.resolve(rpcResult)
    throw new Error(`unexpected rpc: ${fn}`)
  })
  mockPaymentsInsert.mockReset().mockResolvedValue({ error: null })
  mockFetchAllGroupMembers.mockReset().mockResolvedValue(MEMBERS)
  mockChannel.mockReset().mockImplementation(() => makeChannel())
  mockRemoveChannel.mockReset()
  mockNavigate.mockReset()
  // This page seeds its initial group/members/settlement state straight
  // from groupViewCache (the same cache GroupView.jsx itself paints
  // from) — cleared here so a previous test's load() can't leak into the
  // next one's first render, same reasoning as groupRosterCache
  // elsewhere in this suite.
  groupViewCache.clear()
})

describe('SettleUp — loading', () => {
  it('shows a loading state with nothing cached', () => {
    mockFetchAllGroupMembers.mockReturnValue(new Promise(() => {})) // never resolves this test
    renderPage()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('paints from groupViewCache before the fetch even resolves', () => {
    groupViewCache.set('group-1', {
      group: { id: 'group-1', name: 'Beach Trip' },
      allMembers: MEMBERS,
      settlement: [{ from: 'member-carol', to: 'member-alice', amount: 10 }],
    })
    mockFetchAllGroupMembers.mockReturnValue(new Promise(() => {})) // never resolves this test

    renderPage()

    // No `await`/`findBy` — asserts the *first* render already has it,
    // seeded from the cache, not the still-pending fetch above.
    expect(screen.getByText('Carol')).toBeInTheDocument()
  })

  it("shows an error when the group itself can't be loaded", async () => {
    groupsSelectResult = { data: null, error: { message: 'network error' } }
    renderPage()
    expect(await screen.findByText(/Couldn't load this group: network error/)).toBeInTheDocument()
  })

  it('bounces back to the groups list, with a notice, when the group has been deleted', async () => {
    groupsSelectResult = {
      data: null,
      error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    }
    renderPage()
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/', { state: { notice: 'This group is no longer available.' } })
    )
  })

  it("shows an error when balances can't be loaded", async () => {
    rpcResult = { data: null, error: { message: 'balances query failed' } }
    renderPage()
    expect(await screen.findByText(/Couldn't load balances: balances query failed/)).toBeInTheDocument()
  })
})

describe('SettleUp — settlement list', () => {
  it('shows the empty state once loaded with nothing to settle', async () => {
    rpcResult = { data: [], error: null }
    renderPage()
    expect(await screen.findByText("Everyone's even — nothing to settle.")).toBeInTheDocument()
  })

  it("lists your own debts first, phrased from your perspective", async () => {
    renderPage()

    const mine = (await findMineDebtor()).closest('li')
    expect(within(mine).getByText('Carol', { selector: '.debtor' })).toBeInTheDocument()
    expect(within(mine).getByText('You', { selector: '.creditor' })).toBeInTheDocument()
    expect(within(mine).getByText('€10.00')).toBeInTheDocument()
  })

  it("collapses everyone else's debts under a count, not involving you", async () => {
    renderPage()
    await findMineDebtor()

    expect(screen.getByText('Other debts in this group (1)')).toBeInTheDocument()
    const othersRow = screen.getByText('Bob', { selector: '.creditor' }).closest('li')
    expect(within(othersRow).getByText('Carol', { selector: '.debtor' })).toBeInTheDocument()
    expect(within(othersRow).getByText('€5.00')).toBeInTheDocument()
  })

  it("shows a settled message instead of a debt list when you have nothing owing", async () => {
    // Only the Bob <-> Carol debt — Alice (you) isn't involved in anything.
    rpcResult = { data: [{ member_id: 'member-bob', balance: '15.00' }, { member_id: 'member-carol', balance: '-15.00' }], error: null }
    renderPage()

    expect(await screen.findByText("You're all settled up in this group.")).toBeInTheDocument()
    expect(screen.getByText('Other debts in this group (1)')).toBeInTheDocument()
  })
})

describe('SettleUp — marking a debt paid', () => {
  it('records a payment for one of your own debts with the right ids and amount, then reloads', async () => {
    const user = userEvent.setup()
    renderPage()

    const mineRow = (await findMineDebtor()).closest('li')
    await user.click(within(mineRow).getByRole('button', { name: 'Mark paid' }))

    expect(mockPaymentsInsert).toHaveBeenCalledWith({
      group_id: 'group-1',
      from_member: 'member-carol',
      to_member: 'member-alice',
      amount: 10,
      created_by: 'user-me',
    })
    await waitFor(() => expect(mockFetchAllGroupMembers).toHaveBeenCalledTimes(2)) // initial load + reload
  })

  it("records a payment for someone else's debt from the collapsed section too", async () => {
    const user = userEvent.setup()
    renderPage()
    await findMineDebtor()

    const othersRow = screen.getByText('Bob', { selector: '.creditor' }).closest('li')
    await user.click(within(othersRow).getByRole('button', { name: 'Mark paid' }))

    expect(mockPaymentsInsert).toHaveBeenCalledWith({
      group_id: 'group-1',
      from_member: 'member-carol',
      to_member: 'member-bob',
      amount: 5,
      created_by: 'user-me',
    })
  })

  it('shows an error and keeps the debt listed when recording the payment fails', async () => {
    const user = userEvent.setup()
    mockPaymentsInsert.mockResolvedValue({ error: { message: 'could not record payment' } })
    renderPage()

    const mineRow = (await findMineDebtor()).closest('li')
    await user.click(within(mineRow).getByRole('button', { name: 'Mark paid' }))

    expect(await screen.findByText('could not record payment')).toBeInTheDocument()
    expect(screen.getByText('Carol', { selector: '.settle-your-debts .debtor' })).toBeInTheDocument()
  })
})

describe('SettleUp — realtime subscription', () => {
  it('subscribes to bills/items/item_shares/payments/group_members for this group, and unsubscribes on unmount', async () => {
    const { unmount } = renderPage()
    await findMineDebtor()

    expect(mockChannel).toHaveBeenCalledWith('settle-up-group-1')
    const channel = mockChannel.mock.results[0].value
    expect(channel.on).toHaveBeenCalledTimes(5)
    expect(channel.subscribe).toHaveBeenCalledOnce()

    unmount()
    expect(mockRemoveChannel).toHaveBeenCalledWith(channel)
  })
})
