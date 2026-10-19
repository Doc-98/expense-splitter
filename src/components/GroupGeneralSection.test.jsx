import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GroupGeneralSection from './GroupGeneralSection'

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

// This component only ever calls useParams() (for groupId) and
// useNavigate() (to bounce back if the group's gone — see loadGroup), so
// no real Router is needed.
vi.mock('react-router-dom', () => ({
  useParams: () => ({ groupId: 'group-1' }),
  useNavigate: () => mockNavigate,
}))

// Mirrors the exact chain shapes GroupGeneralSection.jsx actually calls
// (see loadGroup/saveName there) rather than a
// generic catch-all query builder — easier to read, and just as easy to
// extend if a future test here needs a chain this doesn't cover yet.
function groupsTable() {
  return {
    select: () => ({ eq: () => ({ single: () => Promise.resolve(groupsSelectResult) }) }),
    update: () => ({ eq: () => Promise.resolve(groupsUpdateResult) }),
  }
}

// Plain `let`s, reassigned per test (or mid-test, for the save-error
// cases) — mockFrom below always reads whatever they currently hold, so a
// test can change what the *next* call returns without needing a fresh
// mockImplementation each time.
let groupsSelectResult
let groupsUpdateResult

beforeEach(() => {
  groupsSelectResult = { data: { name: 'Beach Trip' } }
  groupsUpdateResult = { error: null }
  mockFrom.mockImplementation((table) => {
    if (table !== 'groups') throw new Error(`unexpected table: ${table}`)
    return groupsTable()
  })
  mockNavigate.mockReset()
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
    const user = userEvent.setup({ delay: null })
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
    const user = userEvent.setup({ delay: null })
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
    const user = userEvent.setup({ delay: null })
    render(<GroupGeneralSection />)

    const input = await screen.findByPlaceholderText('Group name')
    await user.clear(input)
    await user.type(input, 'Mountain Trip')
    groupsUpdateResult = { error: { message: 'network error' } }
    await user.click(screen.getByLabelText('Save group name'))

    expect(await screen.findByText('network error')).toBeInTheDocument()
    expect(input).toHaveValue('Mountain Trip') // draft survives the failed save
  })
})
