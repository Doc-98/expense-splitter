import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GroupMembersSection from './GroupMembersSection'
import { groupRosterCache } from '../lib/groupRosterCache'


// Picks an action from a member's ⋮ menu.
async function chooseFromMenu(user, name, action) {
  await user.click(await screen.findByRole('button', { name: `Actions for ${name}` }))
  await user.click(screen.getByRole('button', { name: action }))
}

// Answers the app's own confirm sheet (see useConfirm).
const answerSheet = (user, name) => user.click(within(screen.getByRole('dialog')).getByRole('button', { name }))

// Same vi.hoisted() reasoning as GroupGeneralSection.test.jsx — vi.mock()
// factories are hoisted above ordinary variable declarations, so each
// mock function has to be created inside the hoisted block to be safely
// referenced both there and in the test bodies below.
const { mockFetchGroupRosterData, mockRpc, mockFetchCategories, mockSnapshotAndRemoveMember, mockSetMemberAvatar } =
  vi.hoisted(() => ({
    mockFetchGroupRosterData: vi.fn(),
    mockRpc: vi.fn(),
    mockFetchCategories: vi.fn(),
    mockSnapshotAndRemoveMember: vi.fn(),
    mockSetMemberAvatar: vi.fn(),
  }))

// Unlike GroupGeneralSection, this component never builds a Supabase query
// chain itself — every read/write goes through a lib function
// (fetchGroupRosterData, fetchCategories, snapshotAndRemoveMember) except
// the one direct supabase.rpc() call for admin transfer. So the mock
// boundary here is those lib functions, not supabaseClient's query
// builder — same idea README's "Running the tests" section already
// documents for the AI strategy modules, applied to a component.
vi.mock('../lib/prefetchGroupSettings', () => ({ fetchGroupRosterData: mockFetchGroupRosterData }))
vi.mock('../lib/categories', () => ({ fetchCategories: mockFetchCategories }))
vi.mock('../lib/leaveGroup', () => ({ snapshotAndRemoveMember: mockSnapshotAndRemoveMember }))
vi.mock('../supabaseClient', () => ({ supabase: { rpc: mockRpc } }))
vi.mock('../lib/members', () => ({ setMemberAvatar: mockSetMemberAvatar }))
vi.mock('react-router-dom', () => ({
  useParams: () => ({ groupId: 'group-1' }),
  useSearchParams: () => [new URLSearchParams()],
}))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-me' } }) }))

// Reused across most tests, with only adminId varying — Marco ('user-me')
// is the signed-in account throughout; which member row adminId points at
// is what flips isAdmin. Guest Gary (userId: null) exercises the "guests
// excluded entirely" filter — GroupGuestsSection.jsx is where a guest
// actually gets managed — and Carol (active: false) exercises the Former
// members split.
function membersFixture() {
  return [
    { id: 'member-alice', userId: 'user-alice', name: 'Alice', isGuest: false, active: true },
    { id: 'member-me', userId: 'user-me', name: 'Marco', isGuest: false, active: true },
    { id: 'member-bob', userId: 'user-bob', name: 'Bob', isGuest: false, active: true },
    { id: 'member-carol', userId: 'user-carol', name: 'Carol', isGuest: false, active: false },
    { id: 'member-guest', userId: null, name: 'Guest Gary', isGuest: true, active: true },
  ]
}
function rosterAsAdmin() {
  return { name: 'Beach Trip', adminId: 'member-me', inviteCode: 'abc123', members: membersFixture() }
}
function rosterAsMember() {
  return { name: 'Beach Trip', adminId: 'member-alice', inviteCode: 'abc123', members: membersFixture() }
}

beforeEach(() => {
  mockFetchGroupRosterData.mockReset().mockResolvedValue(rosterAsMember())
  mockRpc.mockReset().mockResolvedValue({ error: null })
  mockFetchCategories.mockReset().mockResolvedValue([])
  mockSnapshotAndRemoveMember.mockReset().mockResolvedValue(undefined)
  mockSetMemberAvatar.mockReset().mockResolvedValue(undefined)
  // A previous test's load() would otherwise leave this group's roster
  // cached in the shared, module-level groupRosterCache — this component
  // seeds its initial state straight from that cache, so a later test
  // would start from stale state instead of that test's own fixture.
  groupRosterCache.clear()
})

describe('GroupMembersSection', () => {
  it('loads and shows active real members, excluding guests', async () => {
    render(<GroupMembersSection />)

    expect(await screen.findByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Members (3)')).toBeInTheDocument() // Alice, Marco, Bob — not the guest
    expect(screen.queryByText('Guest Gary')).not.toBeInTheDocument()
  })

  it('tags the signed-in member as "(you)" and the admin as "(admin)"', async () => {
    render(<GroupMembersSection />) // rosterAsMember: Alice is admin, Marco is "you"

    const marcoRow = (await screen.findByText('Marco')).closest('li')
    const aliceRow = screen.getByText('Alice').closest('li')
    expect(marcoRow).toHaveTextContent('(you)')
    expect(marcoRow).not.toHaveTextContent('(admin)')
    expect(aliceRow).toHaveTextContent('(admin)')
  })

  it('paints from groupRosterCache before the fetch even resolves', () => {
    groupRosterCache.set('group-1', rosterAsMember())
    mockFetchGroupRosterData.mockReturnValue(new Promise(() => {})) // never resolves this test

    render(<GroupMembersSection />)

    // No `await`/`findBy` — this asserts the *first* render already has
    // it, seeded straight from the cache, not from the (still-pending)
    // fetch above.
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('hides Make admin/Remove for a non-admin, and shows the admin-only note', async () => {
    render(<GroupMembersSection />) // rosterAsMember: Marco isn't the admin

    await screen.findByText('Alice')
    // Only your own row has a menu, and only to choose your avatar.
    expect(screen.queryByRole('button', { name: 'Actions for Alice' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Marco' }))
    expect(screen.getByRole('button', { name: 'Choose avatar' })).toBeInTheDocument()
    expect(screen.queryByText('Make admin')).not.toBeInTheDocument()
    expect(screen.queryByText('Remove')).not.toBeInTheDocument()
    expect(screen.getByText(/Only the group admin can remove other members/)).toBeInTheDocument()
  })

  it("shows Make admin/Remove for others, but not for the admin's own row", async () => {
    mockFetchGroupRosterData.mockResolvedValue(rosterAsAdmin()) // Marco is the admin here
    render(<GroupMembersSection />)

    const user = userEvent.setup({ delay: null })
    await user.click(await screen.findByRole('button', { name: 'Actions for Alice' }))
    expect(screen.getByRole('button', { name: 'Make admin' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Actions for Marco' }))
    // Admin's own row: never a target for its own actions, but your avatar.
    const marcoMenu = screen.getByText('Marco').closest('li').querySelector('.row-menu-popover')
    expect(marcoMenu).toHaveTextContent('Choose avatar')
    expect(marcoMenu).not.toHaveTextContent('Make admin')
  })

  it('lists an inactive real member under Former members, with no actions', async () => {
    render(<GroupMembersSection />)

    expect(await screen.findByText('Former members')).toBeInTheDocument()
    const carolRow = screen.getByText('Carol').closest('li')
    expect(carolRow).not.toHaveTextContent('Make admin')
    expect(carolRow).not.toHaveTextContent('Remove')
  })

  it('transfers admin on confirm, with the right ids, then reloads', async () => {
    const user = userEvent.setup({ delay: null })
    mockFetchGroupRosterData.mockResolvedValue(rosterAsAdmin())
    render(<GroupMembersSection />)

    await chooseFromMenu(user, 'Bob', 'Make admin')
    await answerSheet(user, 'Make admin')

    expect(mockRpc).toHaveBeenCalledWith('transfer_admin', {
      target_group_id: 'group-1',
      new_admin_id: 'member-bob',
    })
    await waitFor(() => expect(mockFetchGroupRosterData).toHaveBeenCalledTimes(2)) // initial load + reload
  })

  it('does not transfer admin when the sheet is cancelled', async () => {
    const user = userEvent.setup({ delay: null })
    mockFetchGroupRosterData.mockResolvedValue(rosterAsAdmin())
    render(<GroupMembersSection />)

    await chooseFromMenu(user, 'Bob', 'Make admin')
    await answerSheet(user, 'Cancel')

    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('shows an error when the admin transfer fails', async () => {
    const user = userEvent.setup({ delay: null })
    mockFetchGroupRosterData.mockResolvedValue(rosterAsAdmin())
    mockRpc.mockResolvedValue({ error: { message: 'transfer failed' } })
    render(<GroupMembersSection />)

    await chooseFromMenu(user, 'Bob', 'Make admin')
    await answerSheet(user, 'Make admin')

    expect(await screen.findByText('transfer failed')).toBeInTheDocument()
  })

  it('removes a member on confirm — fetches categories, snapshots, then reloads', async () => {
    const user = userEvent.setup({ delay: null })
    const categories = [{ id: 'cat-1', name: 'Groceries' }]
    mockFetchGroupRosterData.mockResolvedValue(rosterAsAdmin())
    mockFetchCategories.mockResolvedValue(categories)
    render(<GroupMembersSection />)

    await chooseFromMenu(user, 'Bob', 'Remove')
    await answerSheet(user, 'Remove')

    expect(mockFetchCategories).toHaveBeenCalledWith('group-1')
    expect(mockSnapshotAndRemoveMember).toHaveBeenCalledWith({
      groupId: 'group-1',
      groupName: 'Beach Trip',
      member: rosterAsAdmin().members.find((m) => m.id === 'member-bob'),
      categories,
    })
    await waitFor(() => expect(mockFetchGroupRosterData).toHaveBeenCalledTimes(2))
  })

  it('does not remove a member when the sheet is cancelled', async () => {
    const user = userEvent.setup({ delay: null })
    mockFetchGroupRosterData.mockResolvedValue(rosterAsAdmin())
    render(<GroupMembersSection />)

    await chooseFromMenu(user, 'Bob', 'Remove')
    await answerSheet(user, 'Cancel')

    expect(mockFetchCategories).not.toHaveBeenCalled()
    expect(mockSnapshotAndRemoveMember).not.toHaveBeenCalled()
  })

  it('shows an error when removing a member fails', async () => {
    const user = userEvent.setup({ delay: null })
    mockFetchGroupRosterData.mockResolvedValue(rosterAsAdmin())
    mockSnapshotAndRemoveMember.mockRejectedValue(new Error('could not remove member'))
    render(<GroupMembersSection />)

    await chooseFromMenu(user, 'Bob', 'Remove')
    await answerSheet(user, 'Remove')

    expect(await screen.findByText('could not remove member')).toBeInTheDocument()
  })

  it('shows an error when the initial load fails', async () => {
    mockFetchGroupRosterData.mockRejectedValue(new Error('could not load members'))
    render(<GroupMembersSection />)

    expect(await screen.findByText('could not load members')).toBeInTheDocument()
  })

  it("shows each member's avatar; the admin can change anyone's, leaving out ones already taken", async () => {
    const user = userEvent.setup({ delay: null })
    const roster = rosterAsAdmin()
    roster.members[0] = { ...roster.members[0], avatarIcon: 'cat', groupAvatarIcon: null, defaultAvatarIcon: 'cat' }
    mockFetchGroupRosterData.mockResolvedValue(roster)
    render(<GroupMembersSection />)

    await user.click(await screen.findByRole('button', { name: "Choose Bob's avatar" }))
    const bobRow = within(screen.getByText('Bob').closest('li'))
    expect(bobRow.queryByRole('button', { name: 'Cat' })).not.toBeInTheDocument() // Alice's
    await user.click(bobRow.getByRole('button', { name: 'Duck' }))
    expect(mockSetMemberAvatar).toHaveBeenCalledWith('member-bob', 'duck', { asAdmin: true })
  })

  it('lets a member change only their own avatar', async () => {
    const user = userEvent.setup({ delay: null })
    render(<GroupMembersSection />) // Marco isn't the admin
    await screen.findByText('Alice')
    expect(screen.queryByRole('button', { name: "Choose Alice's avatar" })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: "Choose Marco's avatar" }))
    await user.click(within(screen.getByText('Marco').closest('li')).getByRole('button', { name: 'Bee' }))
    expect(mockSetMemberAvatar).toHaveBeenCalledWith('member-me', 'bee', { asAdmin: false })
  })

  it('puts the avatar back and says so when saving it fails', async () => {
    const user = userEvent.setup({ delay: null })
    mockSetMemberAvatar.mockRejectedValue(new Error('offline'))
    render(<GroupMembersSection />)
    await user.click(await screen.findByRole('button', { name: "Choose Marco's avatar" }))
    const marcoRow = within(screen.getByText('Marco').closest('li'))
    await user.click(marcoRow.getByRole('button', { name: 'Bee' }))
    expect(await screen.findByText("Couldn't change Marco's avatar: offline")).toBeInTheDocument()
    expect(marcoRow.getByRole('button', { name: 'Bee' })).not.toHaveClass('is-selected')
  })
})
