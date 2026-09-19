import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GroupMembersSection from './GroupMembersSection'
import { groupRosterCache } from '../lib/groupRosterCache'

// Same vi.hoisted() reasoning as GroupGeneralSection.test.jsx — vi.mock()
// factories are hoisted above ordinary variable declarations, so each
// mock function has to be created inside the hoisted block to be safely
// referenced both there and in the test bodies below.
const { mockFetchGroupRosterData, mockRpc, mockFetchCategories, mockSnapshotAndRemoveMember } = vi.hoisted(() => ({
  mockFetchGroupRosterData: vi.fn(),
  mockRpc: vi.fn(),
  mockFetchCategories: vi.fn(),
  mockSnapshotAndRemoveMember: vi.fn(),
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
vi.mock('react-router-dom', () => ({ useParams: () => ({ groupId: 'group-1' }) }))
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
  vi.spyOn(window, 'confirm').mockReturnValue(true)
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
    expect(screen.queryByText('Make admin')).not.toBeInTheDocument()
    expect(screen.queryByText('Remove')).not.toBeInTheDocument()
    expect(screen.getByText(/Only the group admin can remove other members/)).toBeInTheDocument()
  })

  it("shows Make admin/Remove for others, but not for the admin's own row", async () => {
    mockFetchGroupRosterData.mockResolvedValue(rosterAsAdmin()) // Marco is the admin here
    render(<GroupMembersSection />)

    const aliceRow = (await screen.findByText('Alice')).closest('li')
    const bobRow = screen.getByText('Bob').closest('li')
    const marcoRow = screen.getByText('Marco').closest('li')
    expect(aliceRow).toHaveTextContent('Make admin')
    expect(bobRow).toHaveTextContent('Make admin')
    expect(marcoRow).not.toHaveTextContent('Make admin') // admin's own row, never a target for its own actions
  })

  it('lists an inactive real member under Former members, with no actions', async () => {
    render(<GroupMembersSection />)

    expect(await screen.findByText('Former members')).toBeInTheDocument()
    const carolRow = screen.getByText('Carol').closest('li')
    expect(carolRow).not.toHaveTextContent('Make admin')
    expect(carolRow).not.toHaveTextContent('Remove')
  })

  it('transfers admin on confirm, with the right ids, then reloads', async () => {
    const user = userEvent.setup()
    mockFetchGroupRosterData.mockResolvedValue(rosterAsAdmin())
    render(<GroupMembersSection />)

    await user.click((await screen.findByText('Bob')).closest('li').querySelector('.btn-link'))

    expect(mockRpc).toHaveBeenCalledWith('transfer_admin', {
      target_group_id: 'group-1',
      new_admin_id: 'member-bob',
    })
    await waitFor(() => expect(mockFetchGroupRosterData).toHaveBeenCalledTimes(2)) // initial load + reload
  })

  it('does not transfer admin when the confirm is cancelled', async () => {
    const user = userEvent.setup()
    window.confirm.mockReturnValue(false)
    mockFetchGroupRosterData.mockResolvedValue(rosterAsAdmin())
    render(<GroupMembersSection />)

    await user.click((await screen.findByText('Bob')).closest('li').querySelector('.btn-link'))

    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('shows an error when the admin transfer fails', async () => {
    const user = userEvent.setup()
    mockFetchGroupRosterData.mockResolvedValue(rosterAsAdmin())
    mockRpc.mockResolvedValue({ error: { message: 'transfer failed' } })
    render(<GroupMembersSection />)

    await user.click((await screen.findByText('Bob')).closest('li').querySelector('.btn-link'))

    expect(await screen.findByText('transfer failed')).toBeInTheDocument()
  })

  it('removes a member on confirm — fetches categories, snapshots, then reloads', async () => {
    const user = userEvent.setup()
    const categories = [{ id: 'cat-1', name: 'Groceries' }]
    mockFetchGroupRosterData.mockResolvedValue(rosterAsAdmin())
    mockFetchCategories.mockResolvedValue(categories)
    render(<GroupMembersSection />)

    const bobRow = (await screen.findByText('Bob')).closest('li')
    await user.click(bobRow.querySelector('.dropdown-item-warn'))

    expect(mockFetchCategories).toHaveBeenCalledWith('group-1')
    expect(mockSnapshotAndRemoveMember).toHaveBeenCalledWith({
      groupId: 'group-1',
      groupName: 'Beach Trip',
      member: rosterAsAdmin().members.find((m) => m.id === 'member-bob'),
      categories,
    })
    await waitFor(() => expect(mockFetchGroupRosterData).toHaveBeenCalledTimes(2))
  })

  it('does not remove a member when the confirm is cancelled', async () => {
    const user = userEvent.setup()
    window.confirm.mockReturnValue(false)
    mockFetchGroupRosterData.mockResolvedValue(rosterAsAdmin())
    render(<GroupMembersSection />)

    const bobRow = (await screen.findByText('Bob')).closest('li')
    await user.click(bobRow.querySelector('.dropdown-item-warn'))

    expect(mockFetchCategories).not.toHaveBeenCalled()
    expect(mockSnapshotAndRemoveMember).not.toHaveBeenCalled()
  })

  it('shows an error when removing a member fails', async () => {
    const user = userEvent.setup()
    mockFetchGroupRosterData.mockResolvedValue(rosterAsAdmin())
    mockSnapshotAndRemoveMember.mockRejectedValue(new Error('could not remove member'))
    render(<GroupMembersSection />)

    const bobRow = (await screen.findByText('Bob')).closest('li')
    await user.click(bobRow.querySelector('.dropdown-item-warn'))

    expect(await screen.findByText('could not remove member')).toBeInTheDocument()
  })

  it('shows an error when the initial load fails', async () => {
    mockFetchGroupRosterData.mockRejectedValue(new Error('could not load members'))
    render(<GroupMembersSection />)

    expect(await screen.findByText('could not load members')).toBeInTheDocument()
  })
})
