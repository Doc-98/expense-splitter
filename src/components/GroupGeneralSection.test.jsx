import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GroupGeneralSection from './GroupGeneralSection'
import { avatarIconCache } from '../lib/avatarIconCache'

// vi.hoisted() rather than a plain top-level `const` — vi.mock() calls are
// hoisted above the rest of the file (including imports), so a factory
// that closes over an ordinary variable would run before that variable's
// declaration was ever reached. Wrapping the vi.fn() itself in vi.hoisted()
// hoists its *creation* right along with the mocks that reference it,
// which is what lets `mockFrom` below be both configured per-test and
// handed to the mocked supabase client.
const { mockFrom, mockNavigate } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockNavigate: vi.fn() }))

vi.mock('../supabaseClient', () => ({
  supabase: { from: mockFrom },
}))

// This component only ever calls useParams() (for groupId), useNavigate()
// (to bounce back if the group's gone — see loadGroup) and useAuth() (for
// user.id/displayName) — neither a real Router nor a real AuthProvider is
// needed (AuthProvider itself talks to supabase.auth on mount, which would
// just be more to mock for no benefit here), so both are replaced outright
// rather than wrapped.
vi.mock('react-router-dom', () => ({
  useParams: () => ({ groupId: 'group-1' }),
  useNavigate: () => mockNavigate,
}))
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, displayName: 'Marco' }),
}))

// Mirrors the exact chain shapes GroupGeneralSection.jsx actually calls
// (see loadGroup/loadMember/saveName/saveAvatarIcon there) rather than a
// generic catch-all query builder — easier to read, and just as easy to
// extend if a future test here needs a chain this doesn't cover yet.
function groupsTable() {
  return {
    select: () => ({ eq: () => ({ single: () => Promise.resolve(groupsSelectResult) }) }),
    update: () => ({ eq: () => Promise.resolve(groupsUpdateResult) }),
  }
}
function membersTable() {
  return {
    select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve(membersSelectResult) }) }) }),
    update: () => ({ eq: () => Promise.resolve(membersUpdateResult) }),
  }
}

// Plain `let`s, reassigned per test (or mid-test, for the save-error
// cases) — mockFrom below always reads whatever they currently hold, so a
// test can change what the *next* call returns without needing a fresh
// mockImplementation each time.
let groupsSelectResult
let groupsUpdateResult
let membersSelectResult
let membersUpdateResult

beforeEach(() => {
  groupsSelectResult = { data: { name: 'Beach Trip' } }
  groupsUpdateResult = { error: null }
  membersSelectResult = { data: { id: 'member-1', avatar_icon: null } }
  membersUpdateResult = { error: null }
  mockFrom.mockImplementation((table) => (table === 'groups' ? groupsTable() : membersTable()))
  mockNavigate.mockReset()
  // A previous test's saveAvatarIcon success would otherwise leave this
  // group's icon cached in the shared, module-level avatarIconCache —
  // GroupGeneralSection seeds its initial avatarIcon state straight from
  // that cache, so a later test would start from stale state instead of
  // this file's own fresh membersSelectResult above.
  avatarIconCache.clear()
})

describe('GroupGeneralSection', () => {
  it('loads and shows the current group name once the fetch resolves', async () => {
    render(<GroupGeneralSection />)
    expect(await screen.findByPlaceholderText('Group name')).toHaveValue('Beach Trip')
  })

  it('bounces back to the groups list, with a notice, when the group has been deleted', async () => {
    groupsSelectResult = {
      data: null,
      error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    }
    render(<GroupGeneralSection />)
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/', { state: { notice: 'This group is no longer available.' } })
    )
  })

  it('keeps Save disabled until the name actually changes', async () => {
    const user = userEvent.setup()
    render(<GroupGeneralSection />)

    const input = await screen.findByPlaceholderText('Group name')
    const saveBtn = screen.getByLabelText('Save group name')
    expect(saveBtn).toBeDisabled()

    await user.type(input, ' ')
    expect(saveBtn).toBeDisabled() // trims to the same name, still disabled

    await user.type(input, 'Extended')
    expect(saveBtn).not.toBeDisabled()
  })

  it('saves a renamed group and disables Save again on success', async () => {
    const user = userEvent.setup()
    render(<GroupGeneralSection />)

    const input = await screen.findByPlaceholderText('Group name')
    await user.clear(input)
    await user.type(input, 'Mountain Trip')
    await user.click(screen.getByLabelText('Save group name'))

    await waitFor(() => expect(screen.getByLabelText('Save group name')).toBeDisabled())
    expect(mockFrom).toHaveBeenCalledWith('groups')
    expect(input).toHaveValue('Mountain Trip')
  })

  it('shows the error and leaves the draft in place when the rename fails', async () => {
    const user = userEvent.setup()
    render(<GroupGeneralSection />)

    const input = await screen.findByPlaceholderText('Group name')
    await user.clear(input)
    await user.type(input, 'Mountain Trip')
    groupsUpdateResult = { error: { message: 'network error' } }
    await user.click(screen.getByLabelText('Save group name'))

    expect(await screen.findByText('network error')).toBeInTheDocument()
    expect(input).toHaveValue('Mountain Trip') // draft survives the failed save
  })

  it('picks an avatar icon, saving it optimistically', async () => {
    const user = userEvent.setup()
    render(<GroupGeneralSection />)

    await screen.findByPlaceholderText('Group name') // wait for the initial loads to settle
    await user.click(screen.getByRole('button', { name: 'Choose your avatar' }))
    await user.click(screen.getByRole('button', { name: 'Bomb' }))

    // Optimistic: the tile lights up before the (mocked) request even
    // resolves, matching saveAvatarIcon's own setAvatarIcon-before-await.
    expect(screen.getByRole('button', { name: 'Bomb' })).toHaveClass('is-selected')
    await waitFor(() => expect(mockFrom).toHaveBeenCalledWith('group_members'))
  })

  it('reverts the icon and shows an error when saving it fails', async () => {
    const user = userEvent.setup()
    render(<GroupGeneralSection />)

    await screen.findByPlaceholderText('Group name')
    await user.click(screen.getByRole('button', { name: 'Choose your avatar' }))
    membersUpdateResult = { error: { message: 'could not save icon' } }
    await user.click(screen.getByRole('button', { name: 'Bomb' }))

    expect(await screen.findByText('could not save icon')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Bomb' })).not.toHaveClass('is-selected'))
  })
})
