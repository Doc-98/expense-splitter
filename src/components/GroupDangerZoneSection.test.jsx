import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GroupDangerZoneSection from './GroupDangerZoneSection'

// Same vi.hoisted() reasoning as GroupGeneralSection.test.jsx/
// GroupMembersSection.test.jsx — vi.mock() factories are hoisted above
// ordinary variable declarations.
const { mockFetchGroupRole, mockFetchCategories, mockSnapshotAndRemoveMember, mockRpc, mockNavigate } = vi.hoisted(
  () => ({
    mockFetchGroupRole: vi.fn(),
    mockFetchCategories: vi.fn(),
    mockSnapshotAndRemoveMember: vi.fn(),
    mockRpc: vi.fn(),
    mockNavigate: vi.fn(),
  })
)

// "am I the admin here" goes through lib/groupRole.js's own combined
// query (see that file's comment for why) rather than supabase.from()
// chains this component builds itself — same lib-function mocking
// boundary as GroupMembersSection.test.jsx, extended to cover a second
// lib module (leaveGroup/categories already mocked there too) plus
// groupRole here. supabase itself only needs `rpc` — both destructive
// actions this component owns directly (delete_all_group_bills,
// delete_group) go through it, but never a query chain.
vi.mock('../lib/groupRole', () => ({ fetchGroupRole: mockFetchGroupRole }))
vi.mock('../lib/categories', () => ({ fetchCategories: mockFetchCategories }))
vi.mock('../lib/leaveGroup', () => ({ snapshotAndRemoveMember: mockSnapshotAndRemoveMember }))
vi.mock('../supabaseClient', () => ({ supabase: { rpc: mockRpc } }))
vi.mock('react-router-dom', () => ({
  useParams: () => ({ groupId: 'group-1' }),
  useNavigate: () => mockNavigate,
}))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-me' } }) }))

const roleAsAdmin = () => ({
  name: 'Beach Trip',
  isPersonal: false,
  adminId: 'member-me',
  myParticipantId: 'member-me',
  isAdmin: true,
})
const roleAsMember = () => ({
  name: 'Beach Trip',
  isPersonal: false,
  adminId: 'member-alice',
  myParticipantId: 'member-me',
  isAdmin: false,
})
const roleAsPersonal = () => ({
  name: 'Personal',
  isPersonal: true,
  adminId: 'member-me',
  myParticipantId: 'member-me',
  isAdmin: true,
})

beforeEach(() => {
  mockFetchGroupRole.mockReset().mockResolvedValue(roleAsAdmin())
  mockFetchCategories.mockReset().mockResolvedValue([])
  mockSnapshotAndRemoveMember.mockReset().mockResolvedValue(undefined)
  mockRpc.mockReset().mockResolvedValue({ error: null })
  mockNavigate.mockReset()
})

describe('GroupDangerZoneSection', () => {
  it('renders nothing until the role fetch resolves', () => {
    mockFetchGroupRole.mockReturnValue(new Promise(() => {})) // never resolves this test
    const { container } = render(<GroupDangerZoneSection />)
    expect(container).toBeEmptyDOMElement()
  })

  it('bounces back to the groups list, with a notice, when the group has been deleted', async () => {
    mockFetchGroupRole.mockRejectedValue({
      code: 'PGRST116',
      message: 'JSON object requested, multiple (or no) rows returned',
    })
    render(<GroupDangerZoneSection />)
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/', { state: { notice: 'This group is no longer available.' } })
    )
  })

  it('shows all three actions for a group admin', async () => {
    render(<GroupDangerZoneSection />)
    expect(await screen.findByText('Leave group')).toBeInTheDocument()
    expect(screen.getByText('Delete all bills', { selector: 'button' })).toBeInTheDocument()
    expect(screen.getByText('Delete group', { selector: 'button' })).toBeInTheDocument()
  })

  it('hides the admin-only actions for a non-admin, but keeps Leave group', async () => {
    mockFetchGroupRole.mockResolvedValue(roleAsMember())
    render(<GroupDangerZoneSection />)

    expect(await screen.findByText('Leave group')).toBeInTheDocument()
    expect(screen.getByText('Only the group admin can delete all bills in this group.')).toBeInTheDocument()
    expect(screen.getByText('Only the group admin can delete this group.')).toBeInTheDocument()
    expect(screen.queryByText('Delete all bills', { selector: 'button' })).not.toBeInTheDocument()
    expect(screen.queryByText('Delete group', { selector: 'button' })).not.toBeInTheDocument()
  })

  it('hides Leave group and Delete group entirely for a personal space', async () => {
    mockFetchGroupRole.mockResolvedValue(roleAsPersonal())
    render(<GroupDangerZoneSection />)

    expect(await screen.findByText('Delete all bills', { selector: 'button' })).toBeInTheDocument()
    expect(screen.queryByText('Leave group')).not.toBeInTheDocument()
    expect(screen.queryByText('Delete group', { selector: 'button' })).not.toBeInTheDocument()
    expect(screen.queryByText('Delete group')).not.toBeInTheDocument() // not even the muted non-admin copy
  })

  it('leaves the group on confirm: fetches categories, snapshots, then navigates home', async () => {
    const user = userEvent.setup()
    render(<GroupDangerZoneSection />)

    await user.click(await screen.findByText('Leave group'))
    await user.click(screen.getByRole('button', { name: 'Leave' }))

    expect(mockFetchCategories).toHaveBeenCalledWith('group-1')
    expect(mockSnapshotAndRemoveMember).toHaveBeenCalledWith({
      groupId: 'group-1',
      groupName: 'Beach Trip',
      member: { id: 'member-me', userId: 'user-me' },
      categories: [],
    })
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('cancelling the Leave group sheet does nothing', async () => {
    const user = userEvent.setup()
    render(<GroupDangerZoneSection />)

    await user.click(await screen.findByText('Leave group'))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mockSnapshotAndRemoveMember).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows an error and keeps the sheet open when leaving fails', async () => {
    const user = userEvent.setup()
    mockSnapshotAndRemoveMember.mockRejectedValue(new Error('could not leave'))
    render(<GroupDangerZoneSection />)

    await user.click(await screen.findByText('Leave group'))
    await user.click(screen.getByRole('button', { name: 'Leave' }))

    expect(await screen.findByText('could not leave')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument() // sheet still open, re-enabled
  })

  it("gates Delete all bills behind typing the group's exact name", async () => {
    const user = userEvent.setup()
    render(<GroupDangerZoneSection />)

    await user.click(await screen.findByText('Delete all bills', { selector: 'button' }))
    const confirmBtn = within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete all bills' })
    expect(confirmBtn).toBeDisabled()

    await user.type(screen.getByPlaceholderText('Beach Trip'), 'beach trip') // wrong case, still disabled
    expect(confirmBtn).toBeDisabled()

    await user.clear(screen.getByPlaceholderText('Beach Trip'))
    await user.type(screen.getByPlaceholderText('Beach Trip'), 'Beach Trip')
    expect(confirmBtn).not.toBeDisabled()
  })

  it('deletes all bills on confirm, without payments by default', async () => {
    const user = userEvent.setup()
    render(<GroupDangerZoneSection />)

    await user.click(await screen.findByText('Delete all bills', { selector: 'button' }))
    await user.type(screen.getByPlaceholderText('Beach Trip'), 'Beach Trip')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete all bills' }))

    expect(mockRpc).toHaveBeenCalledWith('delete_all_group_bills', {
      target_group_id: 'group-1',
      delete_payments: false,
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument() // closes on success
  })

  it('deletes all bills including payments when the checkbox is ticked', async () => {
    const user = userEvent.setup()
    render(<GroupDangerZoneSection />)

    await user.click(await screen.findByText('Delete all bills', { selector: 'button' }))
    await user.click(screen.getByRole('checkbox'))
    await user.type(screen.getByPlaceholderText('Beach Trip'), 'Beach Trip')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete all bills' }))

    expect(mockRpc).toHaveBeenCalledWith('delete_all_group_bills', {
      target_group_id: 'group-1',
      delete_payments: true,
    })
  })

  it('shows an error and keeps the sheet open when deleting all bills fails', async () => {
    const user = userEvent.setup()
    mockRpc.mockResolvedValue({ error: { message: 'could not delete bills' } })
    render(<GroupDangerZoneSection />)

    await user.click(await screen.findByText('Delete all bills', { selector: 'button' }))
    await user.type(screen.getByPlaceholderText('Beach Trip'), 'Beach Trip')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete all bills' }))

    expect(await screen.findByText('could not delete bills')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('cancelling Delete all bills resets the payments checkbox too', async () => {
    const user = userEvent.setup()
    render(<GroupDangerZoneSection />)

    await user.click(await screen.findByText('Delete all bills', { selector: 'button' }))
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await user.click(screen.getByText('Delete all bills', { selector: 'button' }))
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('deletes the group on confirm and navigates home', async () => {
    const user = userEvent.setup()
    render(<GroupDangerZoneSection />)

    await user.click(await screen.findByText('Delete group', { selector: 'button' }))
    await user.type(screen.getByPlaceholderText('Beach Trip'), 'Beach Trip')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete group' }))

    expect(mockRpc).toHaveBeenCalledWith('delete_group', { target_group_id: 'group-1' })
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('shows an error and keeps the sheet open when deleting the group fails', async () => {
    const user = userEvent.setup()
    mockRpc.mockResolvedValue({ error: { message: 'could not delete group' } })
    render(<GroupDangerZoneSection />)

    await user.click(await screen.findByText('Delete group', { selector: 'button' }))
    await user.type(screen.getByPlaceholderText('Beach Trip'), 'Beach Trip')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete group' }))

    expect(await screen.findByText('could not delete group')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
