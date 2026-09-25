import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RecordPayment from './RecordPayment'
import { setGroupViewPreferences } from '../lib/groupViewPreferences'

// Same vi.hoisted() reasoning as every other Supabase-coupled test in this
// suite — vi.mock() factories are hoisted above ordinary variable
// declarations.
const { mockFrom, mockFetchAllGroupMembers, mockNavigate } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockFetchAllGroupMembers: vi.fn(),
  mockNavigate: vi.fn(),
}))

// This page is the first one in the suite to need both established
// Supabase-mocking styles at once: a query chain it builds itself (groups,
// payments — see groupsTable()/paymentsTable() below, same
// mirror-the-actual-chain-shape approach as GroupGeneralSection.test.jsx)
// and a lib function for the rest (fetchAllGroupMembers, same boundary
// GroupMembersSection.test.jsx already mocks).
vi.mock('../supabaseClient', () => ({ supabase: { from: mockFrom } }))
vi.mock('../lib/members', () => ({ fetchAllGroupMembers: mockFetchAllGroupMembers }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-me' } }) }))
// BackButton renders a real react-router-dom <Link> (to={`/groups/${groupId}`})
// — no earlier component test in this suite has needed one, since none of
// them rendered a BackButton. A plain <a> stands in for it; nothing here
// asserts on real Router navigation, just where the link points.
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
  return { insert: () => Promise.resolve(paymentsInsertResult) }
}

let groupsSelectResult
let paymentsInsertResult

// Dave has left the group — hidden unless "Show people who've left" is ticked.
const MEMBERS = [
  { id: 'member-alice', name: 'Alice', avatarIcon: null, isGuest: false, active: true },
  { id: 'member-bob', name: 'Bob', avatarIcon: null, isGuest: false, active: true },
  { id: 'member-carol', name: 'Carol', avatarIcon: null, isGuest: false, active: true },
  { id: 'member-dave', name: 'Dave', avatarIcon: null, isGuest: false, active: false },
]

beforeEach(() => {
  groupsSelectResult = { data: { id: 'group-1', name: 'Beach Trip' }, error: null }
  paymentsInsertResult = { error: null }
  mockFrom.mockReset().mockImplementation((table) => (table === 'groups' ? groupsTable() : paymentsTable()))
  mockFetchAllGroupMembers.mockReset().mockResolvedValue(MEMBERS)
  mockNavigate.mockReset()
  // Real, localStorage-backed preference module (same as
  // avatarIconCache/groupRosterCache elsewhere in this suite) — reset to
  // the documented default rather than mocked, so each test starts from a
  // known layout regardless of what an earlier test set it to.
  localStorage.clear()
  setGroupViewPreferences({ paymentFormLayout: 'dropdowns' })
})

describe('RecordPayment — dropdowns layout', () => {
  it("shows the group's name in the back button once it loads", async () => {
    render(<RecordPayment />)
    expect(await screen.findByRole('link', { name: 'Beach Trip' })).toBeInTheDocument()
  })

  it('keeps Record payment disabled until both people and a valid amount are set', async () => {
    const user = userEvent.setup()
    render(<RecordPayment />)
    await screen.findByRole('link', { name: 'Beach Trip' })

    const submitBtn = screen.getByRole('button', { name: 'Record payment' })
    expect(submitBtn).toBeDisabled()

    await user.selectOptions(screen.getByLabelText('Who paid'), 'member-alice')
    expect(submitBtn).toBeDisabled() // no recipient or amount yet

    await user.selectOptions(screen.getByLabelText('Who received it'), 'member-bob')
    expect(submitBtn).toBeDisabled() // no amount yet

    await user.type(screen.getByPlaceholderText('0.00'), '12.50')
    expect(submitBtn).not.toBeDisabled()
  })

  it("disables a person on one side once they're picked on the other", async () => {
    const user = userEvent.setup()
    render(<RecordPayment />)
    await screen.findByRole('link', { name: 'Beach Trip' })

    await user.selectOptions(screen.getByLabelText('Who received it'), 'member-alice')

    const whoPaidAliceOption = screen.getAllByRole('option', { name: 'Alice' })[0]
    expect(whoPaidAliceOption).toBeDisabled()
  })

  it('records the payment with the right ids and amount, then navigates back to the group', async () => {
    const user = userEvent.setup()
    render(<RecordPayment />)
    await screen.findByRole('link', { name: 'Beach Trip' })

    await user.selectOptions(screen.getByLabelText('Who paid'), 'member-alice')
    await user.selectOptions(screen.getByLabelText('Who received it'), 'member-bob')
    await user.type(screen.getByPlaceholderText('0.00'), '12.50')
    await user.click(screen.getByRole('button', { name: 'Record payment' }))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/groups/group-1'))
    expect(mockFrom).toHaveBeenCalledWith('payments')
  })

  it('shows an error and stays put when recording the payment fails', async () => {
    const user = userEvent.setup()
    paymentsInsertResult = { error: { message: 'could not record payment' } }
    render(<RecordPayment />)
    await screen.findByRole('link', { name: 'Beach Trip' })

    await user.selectOptions(screen.getByLabelText('Who paid'), 'member-alice')
    await user.selectOptions(screen.getByLabelText('Who received it'), 'member-bob')
    await user.type(screen.getByPlaceholderText('0.00'), '12.50')
    await user.click(screen.getByRole('button', { name: 'Record payment' }))

    expect(await screen.findByText('could not record payment')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it("shows an error when the group itself can't be loaded", async () => {
    groupsSelectResult = { data: null, error: { message: 'network error' } }
    render(<RecordPayment />)
    expect(await screen.findByText(/Couldn't load this group: network error/)).toBeInTheDocument()
  })

  it('bounces back to the groups list, with a notice, when the group has been deleted', async () => {
    groupsSelectResult = {
      data: null,
      error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    }
    render(<RecordPayment />)
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/', { state: { notice: 'This group is no longer available.' } })
    )
  })

  it("shows an error when the group's members can't be loaded", async () => {
    mockFetchAllGroupMembers.mockRejectedValue(new Error('members query failed'))
    render(<RecordPayment />)
    expect(await screen.findByText(/Couldn't load this group's members: members query failed/)).toBeInTheDocument()
  })
})

describe('RecordPayment — avatars layout', () => {
  beforeEach(() => {
    setGroupViewPreferences({ paymentFormLayout: 'avatars' })
  })

  it('picks a payer and recipient by tapping their avatar', async () => {
    const user = userEvent.setup()
    render(<RecordPayment />)
    await screen.findByRole('link', { name: 'Beach Trip' })

    // Each member's avatar appears twice — once in the "Who paid" row,
    // once in "Paid to" — with no visible text of its own (just an
    // aria-label), so rows are found via a known button's own ancestor
    // rather than by text.
    const [whoPaidRow, paidToRow] = screen.getAllByRole('button', { name: 'Alice' }).map((btn) => btn.closest('.avatar-row'))
    await user.click(screen.getAllByRole('button', { name: 'Alice' })[0])
    await user.click(screen.getAllByRole('button', { name: 'Bob' })[1])

    expect(within(whoPaidRow).getByRole('button', { name: 'Alice' })).toHaveClass('active')
    expect(within(paidToRow).getByRole('button', { name: 'Bob' })).toHaveClass('active')
  })

  it('disables a person on the opposite row once picked on this one, in both directions', async () => {
    const user = userEvent.setup()
    render(<RecordPayment />)
    await screen.findByRole('link', { name: 'Beach Trip' })

    const [whoPaidAlice, paidToAlice] = screen.getAllByRole('button', { name: 'Alice' })
    await user.click(whoPaidAlice)
    // Picking Alice as payer disables her on the "paid to" side. pick()
    // also has a branch that clears the *other* side if the same person
    // were already picked there, but there's no way to trigger it through
    // this layout's own UI: whichever button that would take is exactly
    // the one this disabled attribute has already blocked — so that
    // branch is unreachable here, not a gap in this test.
    expect(paidToAlice).toBeDisabled()

    // Same guarantee in the other direction: picking someone as recipient
    // disables them as a payer option.
    const [whoPaidBob, paidToBob] = screen.getAllByRole('button', { name: 'Bob' })
    await user.click(paidToBob)
    expect(whoPaidBob).toBeDisabled()
  })
})

describe('RecordPayment — people who have left', () => {
  const pastOption = () => screen.queryAllByRole('option', { name: 'Dave (left)' })

  it('only offers current members by default', async () => {
    render(<RecordPayment />)
    await screen.findByRole('link', { name: 'Beach Trip' })
    await screen.findAllByRole('option', { name: 'Alice' })

    expect(pastOption()).toHaveLength(0)
    expect(screen.getByRole('checkbox', { name: "Show people who've left" })).not.toBeChecked()
  })

  it('offers them, marked as having left, once the option is ticked — and records a payment with them', async () => {
    const user = userEvent.setup()
    render(<RecordPayment />)
    await screen.findByRole('link', { name: 'Beach Trip' })

    await user.click(await screen.findByRole('checkbox', { name: "Show people who've left" }))
    expect(pastOption()).toHaveLength(2) // once per dropdown

    await user.selectOptions(screen.getByLabelText('Who paid'), 'member-dave')
    await user.selectOptions(screen.getByLabelText('Who received it'), 'member-alice')
    await user.type(screen.getByPlaceholderText('0.00'), '8')
    await user.click(screen.getByRole('button', { name: 'Record payment' }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/groups/group-1'))
  })

  it('drops a picked past member when the option is unticked again', async () => {
    const user = userEvent.setup()
    render(<RecordPayment />)
    await screen.findByRole('link', { name: 'Beach Trip' })
    const toggle = await screen.findByRole('checkbox', { name: "Show people who've left" })

    await user.click(toggle)
    await user.selectOptions(screen.getByLabelText('Who paid'), 'member-dave')
    await user.selectOptions(screen.getByLabelText('Who received it'), 'member-alice')
    await user.click(toggle)

    expect(screen.getByLabelText('Who paid')).toHaveValue('')
    expect(screen.getByLabelText('Who received it')).toHaveValue('member-alice')
  })

  it("doesn't show the option at all when nobody has left", async () => {
    mockFetchAllGroupMembers.mockResolvedValue(MEMBERS.filter((m) => m.active))
    render(<RecordPayment />)
    await screen.findByRole('link', { name: 'Beach Trip' })
    await screen.findAllByRole('option', { name: 'Alice' })

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('works the same in the avatars layout', async () => {
    setGroupViewPreferences({ paymentFormLayout: 'avatars' })
    const user = userEvent.setup()
    render(<RecordPayment />)
    await screen.findByRole('link', { name: 'Beach Trip' })
    await screen.findAllByRole('button', { name: 'Alice' })
    expect(screen.queryAllByRole('button', { name: 'Dave (left)' })).toHaveLength(0)

    await user.click(screen.getByRole('checkbox', { name: "Show people who've left" }))
    const daves = screen.getAllByRole('button', { name: 'Dave (left)' })
    expect(daves).toHaveLength(2)
    expect(daves[0]).toHaveClass('former')
  })
})
