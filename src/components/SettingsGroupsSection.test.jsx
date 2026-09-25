import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsGroupsSection from './SettingsGroupsSection'
import { settingsGroupsCache, SETTINGS_GROUPS_CACHE_KEY } from '../lib/settingsGroupsCache'

// Same vi.hoisted() reasoning as GroupMembersSection.test.jsx/
// GroupDangerZoneSection.test.jsx — vi.mock() factories are hoisted above
// ordinary variable declarations.
const { mockFetchSettingsGroupsRows, mockSnapshotAndRemoveMember, mockFrom } = vi.hoisted(() => ({
  mockFetchSettingsGroupsRows: vi.fn(),
  mockSnapshotAndRemoveMember: vi.fn(),
  mockFrom: vi.fn(),
}))

// This component is lib-mediated for its own list (fetchSettingsGroupsRows,
// snapshotAndRemoveMember) the same way GroupMembersSection/
// GroupDangerZoneSection are, but confirmLeave() also builds one Supabase
// query chain of its own (the categories lookup) rather than going through
// a lib function for it — so this test combines the lib-function boundary
// with a query-chain mock for just that one call, same combined-pattern
// idea as RecordPayment.test.jsx. No router import in this component at
// all, so react-router-dom isn't mocked here.
vi.mock('../lib/prefetchSettings', () => ({ fetchSettingsGroupsRows: mockFetchSettingsGroupsRows }))
vi.mock('../lib/leaveGroup', () => ({ snapshotAndRemoveMember: mockSnapshotAndRemoveMember }))
vi.mock('../supabaseClient', () => ({ supabase: { from: mockFrom } }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-me' } }) }))

function categoriesTable(result) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve(result)),
    })),
  }
}

function groupsFixture() {
  return [
    { id: 'group-1', name: 'Beach Trip', memberId: 'member-me-1', isAdmin: true, memberCount: 3 },
    { id: 'group-2', name: 'Roomies', memberId: 'member-me-2', isAdmin: false, memberCount: 1 },
  ]
}

beforeEach(() => {
  mockFetchSettingsGroupsRows.mockReset().mockResolvedValue(groupsFixture())
  mockSnapshotAndRemoveMember.mockReset().mockResolvedValue(undefined)
  mockFrom.mockReset().mockImplementation((table) => {
    if (table === 'categories') return categoriesTable({ data: [], error: null })
    throw new Error(`unexpected table: ${table}`)
  })
  // A previous test's load() would otherwise leave this cached in the
  // shared, module-level settingsGroupsCache — this component seeds its
  // initial state straight from that cache, same reasoning
  // GroupMembersSection.test.jsx documents for groupRosterCache.
  settingsGroupsCache.clear()
  localStorage.clear()
})

describe('SettingsGroupsSection', () => {
  it('paints from settingsGroupsCache before the fetch even resolves', () => {
    settingsGroupsCache.set(SETTINGS_GROUPS_CACHE_KEY, groupsFixture())
    mockFetchSettingsGroupsRows.mockReturnValue(new Promise(() => {})) // never resolves this test

    render(<SettingsGroupsSection />)

    // No `await`/`findBy` — asserts the *first* render already has it,
    // seeded from the cache, not the still-pending fetch above.
    expect(screen.getByText('Beach Trip')).toBeInTheDocument()
  })

  it('shows a loading state with nothing cached', () => {
    mockFetchSettingsGroupsRows.mockReturnValue(new Promise(() => {}))
    render(<SettingsGroupsSection />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows an empty state once loaded with no groups', async () => {
    mockFetchSettingsGroupsRows.mockResolvedValue([])
    render(<SettingsGroupsSection />)
    expect(await screen.findByText("You're not in any groups yet.")).toBeInTheDocument()
  })

  it('lists groups with an admin tag and singular/plural member counts', async () => {
    render(<SettingsGroupsSection />)

    const beachRow = (await screen.findByText('Beach Trip')).closest('li')
    const roomiesRow = screen.getByText('Roomies').closest('li')
    expect(beachRow).toHaveTextContent('(admin)')
    expect(beachRow).toHaveTextContent('3 members')
    expect(roomiesRow).not.toHaveTextContent('(admin)')
    expect(roomiesRow).toHaveTextContent('1 member')
    expect(roomiesRow).not.toHaveTextContent('1 members')
  })

  it('shows an error when the initial load fails', async () => {
    mockFetchSettingsGroupsRows.mockRejectedValue(new Error('could not load groups'))
    render(<SettingsGroupsSection />)
    expect(await screen.findByText('could not load groups')).toBeInTheDocument()
  })

  it('leaves a group on confirm — fetches categories, snapshots, then updates the list and cache', async () => {
    const user = userEvent.setup({ delay: null })
    const categories = [{ id: 'cat-1', name: 'Groceries' }]
    mockFrom.mockImplementation((table) => {
      if (table === 'categories') return categoriesTable({ data: categories, error: null })
      throw new Error(`unexpected table: ${table}`)
    })
    render(<SettingsGroupsSection />)

    const beachRow = (await screen.findByText('Beach Trip')).closest('li')
    await user.click(within(beachRow).getByRole('button', { name: 'Group actions' }))
    await user.click(within(beachRow).getByText('Leave group'))
    await user.click(screen.getByRole('button', { name: 'Leave' }))

    expect(mockFrom).toHaveBeenCalledWith('categories')
    expect(mockSnapshotAndRemoveMember).toHaveBeenCalledWith({
      groupId: 'group-1',
      groupName: 'Beach Trip',
      member: { id: 'member-me-1', userId: 'user-me' },
      categories,
    })
    expect(screen.queryByText('Beach Trip')).not.toBeInTheDocument()
    expect(screen.getByText('Roomies')).toBeInTheDocument()
    expect(settingsGroupsCache.get(SETTINGS_GROUPS_CACHE_KEY)).toEqual([groupsFixture()[1]])
  })

  it('does not leave the group when the confirm sheet is cancelled', async () => {
    const user = userEvent.setup({ delay: null })
    render(<SettingsGroupsSection />)

    const beachRow = (await screen.findByText('Beach Trip')).closest('li')
    await user.click(within(beachRow).getByRole('button', { name: 'Group actions' }))
    await user.click(within(beachRow).getByText('Leave group'))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockSnapshotAndRemoveMember).not.toHaveBeenCalled()
    expect(screen.getByText('Beach Trip')).toBeInTheDocument()
  })

  it('shows an error and keeps the group in the list when the categories lookup fails', async () => {
    const user = userEvent.setup({ delay: null })
    mockFrom.mockImplementation((table) => {
      if (table === 'categories') return categoriesTable({ data: null, error: { message: 'could not load categories' } })
      throw new Error(`unexpected table: ${table}`)
    })
    render(<SettingsGroupsSection />)

    const beachRow = (await screen.findByText('Beach Trip')).closest('li')
    await user.click(within(beachRow).getByRole('button', { name: 'Group actions' }))
    await user.click(within(beachRow).getByText('Leave group'))
    await user.click(screen.getByRole('button', { name: 'Leave' }))

    expect(await screen.findByText('could not load categories')).toBeInTheDocument()
    expect(mockSnapshotAndRemoveMember).not.toHaveBeenCalled()
    expect(screen.getByText('Beach Trip')).toBeInTheDocument()
  })

  it('shows an error when snapshotAndRemoveMember fails, keeping the group in the list', async () => {
    const user = userEvent.setup({ delay: null })
    mockSnapshotAndRemoveMember.mockRejectedValue(new Error('could not leave group'))
    render(<SettingsGroupsSection />)

    const beachRow = (await screen.findByText('Beach Trip')).closest('li')
    await user.click(within(beachRow).getByRole('button', { name: 'Group actions' }))
    await user.click(within(beachRow).getByText('Leave group'))
    await user.click(screen.getByRole('button', { name: 'Leave' }))

    expect(await screen.findByText('could not leave group')).toBeInTheDocument()
    expect(screen.getByText('Beach Trip')).toBeInTheDocument()
  })

  it('reads and writes the Sticky filters toggle via the real preferences module', async () => {
    const user = userEvent.setup({ delay: null })
    render(<SettingsGroupsSection />)

    const toggle = screen.getByLabelText("Keep a group page's search and filters active after opening a bill")
    expect(toggle).not.toBeChecked()

    await user.click(toggle)
    expect(toggle).toBeChecked()
    expect(JSON.parse(localStorage.getItem('spesa-group-view-preferences')).stickyFilters).toBe(true)
  })
})
