import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GroupSubscriptionsSection from './GroupSubscriptionsSection'
import { CurrencyProvider } from '../context/CurrencyContext'
import { groupSubscriptionsCache } from '../lib/groupSubscriptionsCache'

// Same vi.hoisted() reasoning as every other lib-function-mocked suite —
// vi.mock() factories are hoisted above ordinary variable declarations.
const {
  mockFetchGroupSubscriptionsData,
  mockAddRecurringBill,
  mockUpdateRecurringBill,
  mockSetRecurringBillActive,
  mockDeleteRecurringBill,
  mockCountRecurringBillOccurrences,
} = vi.hoisted(() => ({
  mockFetchGroupSubscriptionsData: vi.fn(),
  mockAddRecurringBill: vi.fn(),
  mockUpdateRecurringBill: vi.fn(),
  mockSetRecurringBillActive: vi.fn(),
  mockDeleteRecurringBill: vi.fn(),
  mockCountRecurringBillOccurrences: vi.fn(),
}))

// This component's own load() goes entirely through one combined lib
// function (fetchGroupSubscriptionsData — members/categories/templates/
// isPersonal in one shot), same boundary-mocking idea as every other
// lib-function suite in this file. Its five write actions
// (add/update/pause/delete/countOccurrences) are separate lib/recurringBills.js
// functions the component calls as `addRecurringBill(supabase, ...)` —
// each taking the raw `supabase` client as an explicit first argument
// rather than importing it internally — so `../supabaseClient` only needs
// a dummy object to satisfy that import; the mocked lib functions never
// actually touch it. CurrencyContext is wrapped for real, same reasoning
// as ItemRow.test.jsx/MultiPayerModal.test.jsx.
vi.mock('../supabaseClient', () => ({ supabase: {} }))
vi.mock('../lib/prefetchGroupSettings', () => ({ fetchGroupSubscriptionsData: mockFetchGroupSubscriptionsData }))
vi.mock('../lib/recurringBills', () => ({
  addRecurringBill: mockAddRecurringBill,
  updateRecurringBill: mockUpdateRecurringBill,
  setRecurringBillActive: mockSetRecurringBillActive,
  deleteRecurringBill: mockDeleteRecurringBill,
  countRecurringBillOccurrences: mockCountRecurringBillOccurrences,
}))
vi.mock('react-router-dom', () => ({ useParams: () => ({ groupId: 'group-1' }) }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-me' } }) }))

function renderSection() {
  return render(
    <CurrencyProvider>
      <GroupSubscriptionsSection />
    </CurrencyProvider>
  )
}

const MEMBERS = [
  { id: 'member-alice', userId: 'user-me', name: 'Alice', avatarIcon: null, isGuest: false, active: true },
  { id: 'member-bob', userId: 'user-bob', name: 'Bob', avatarIcon: null, isGuest: false, active: true },
]
const CATEGORIES = [{ id: 'cat-housing', name: 'Housing', color: '#4a86e8' }]

function templateFixture(overrides = {}) {
  return {
    id: 'template-rent',
    title: 'Rent',
    amount: 1200,
    category_id: 'cat-housing',
    paid_by: 'member-alice',
    frequency: 'monthly',
    next_due_date: '2026-10-01',
    active: true,
    split_member_ids: ['member-alice', 'member-bob'],
    ...overrides,
  }
}

function dataFixture(overrides = {}) {
  return { members: MEMBERS, categories: CATEGORIES, templates: [templateFixture()], isPersonal: false, ...overrides }
}

beforeEach(() => {
  mockFetchGroupSubscriptionsData.mockReset().mockResolvedValue(dataFixture())
  mockAddRecurringBill.mockReset().mockResolvedValue(undefined)
  mockUpdateRecurringBill.mockReset().mockResolvedValue(undefined)
  mockSetRecurringBillActive.mockReset().mockResolvedValue(undefined)
  mockDeleteRecurringBill.mockReset().mockResolvedValue(undefined)
  mockCountRecurringBillOccurrences.mockReset().mockResolvedValue({ count: 0, total: 0 })
  // jsdom doesn't implement scrollIntoView at all — startEdit() calls it
  // unconditionally on a real element (formRef.current), so without this
  // stub clicking "Edit" throws "scrollIntoView is not a function".
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
  // This component seeds its initial state straight from the shared,
  // module-level groupSubscriptionsCache — cleared here so a previous
  // test's load() can't leak into the next one's first render, same
  // reasoning as groupRosterCache/groupCategoriesCache elsewhere in this
  // suite.
  groupSubscriptionsCache.clear()
})

describe('GroupSubscriptionsSection — loading', () => {
  it('paints from groupSubscriptionsCache before the fetch even resolves', () => {
    groupSubscriptionsCache.set('group-1', dataFixture())
    mockFetchGroupSubscriptionsData.mockReturnValue(new Promise(() => {})) // never resolves this test

    renderSection()

    // No `await`/`findBy` — asserts the *first* render already has it,
    // seeded from the cache, not the still-pending fetch above.
    expect(screen.getByText('Rent')).toBeInTheDocument()
  })

  it('loads and lists a template with its amount, payer, frequency, and next due date', async () => {
    renderSection()

    const row = (await screen.findByText('Rent')).closest('li')
    expect(row).toHaveTextContent('€1200.00')
    expect(row).toHaveTextContent('paid by Alice')
    expect(row).toHaveTextContent('Monthly')
    expect(row).toHaveTextContent(new Date('2026-10-01T00:00:00').toLocaleDateString())
    expect(mockFetchGroupSubscriptionsData).toHaveBeenCalledWith('group-1')
  })

  it('marks a paused template and hides no actions, just the row styling', async () => {
    mockFetchGroupSubscriptionsData.mockResolvedValue(dataFixture({ templates: [templateFixture({ active: false })] }))
    renderSection()

    const row = (await screen.findByText('Rent')).closest('li')
    expect(row).toHaveClass('former')
    expect(row).toHaveTextContent('paused')
  })

  it("omits the payer segment for a personal space's subscriptions", async () => {
    mockFetchGroupSubscriptionsData.mockResolvedValue(dataFixture({ isPersonal: true }))
    renderSection()

    const row = (await screen.findByText('Rent')).closest('li')
    expect(row).not.toHaveTextContent('paid by')
  })
})

describe('GroupSubscriptionsSection — adding a subscription', () => {
  it('disables submit until a title and a positive amount are given', async () => {
    const user = userEvent.setup()
    renderSection()
    await screen.findByText('Rent')

    expect(screen.getByRole('button', { name: 'Add subscription' })).toBeDisabled()
    await user.type(screen.getByPlaceholderText('Title (e.g. Rent)'), 'Gym')
    expect(screen.getByRole('button', { name: 'Add subscription' })).toBeDisabled()
    await user.type(screen.getByPlaceholderText('Amount'), '0')
    expect(screen.getByRole('button', { name: 'Add subscription' })).toBeDisabled() // zero isn't positive
    await user.clear(screen.getByPlaceholderText('Amount'))
    await user.type(screen.getByPlaceholderText('Amount'), '45')
    expect(screen.getByRole('button', { name: 'Add subscription' })).not.toBeDisabled()
  })

  it('defaults a new subscription to splitting with every current member', async () => {
    renderSection()
    await screen.findByText('Rent')

    // The default itself comes from a *second* effect, one keyed on
    // `members` rather than running inline with the load — so it lands in
    // a render pass after the one "Rent" (from `templates`, set in the
    // same load()) first appears in. `waitFor` rather than an immediate
    // assertion is what actually waits for that follow-up render instead
    // of racing it.
    await waitFor(() => {
      for (const chip of screen.getAllByRole('checkbox')) {
        expect(chip).toBeChecked()
      }
    })
  })

  it('submits a new subscription with the entered fields, then reloads', async () => {
    const user = userEvent.setup()
    renderSection()
    await screen.findByText('Rent')

    await user.type(screen.getByPlaceholderText('Title (e.g. Rent)'), 'Gym')
    await user.type(screen.getByPlaceholderText('Amount'), '45')
    await user.selectOptions(screen.getByLabelText('Category'), 'cat-housing')
    await user.selectOptions(screen.getByLabelText('Repeats'), 'yearly')
    const startInput = screen.getByLabelText('Starting')
    await user.clear(startInput)
    await user.type(startInput, '2026-03-15')
    await user.click(screen.getByRole('button', { name: 'Add subscription' }))

    expect(mockAddRecurringBill).toHaveBeenCalledWith({}, 'group-1', 'user-me', {
      title: 'Gym',
      amount: 45,
      categoryId: 'cat-housing',
      paidBy: 'member-alice',
      splitMemberIds: ['member-alice', 'member-bob'],
      frequency: 'yearly',
      startDate: new Date('2026-03-15T00:00:00'),
    })
    await waitFor(() => expect(mockFetchGroupSubscriptionsData).toHaveBeenCalledTimes(2)) // initial load + reload
  })

  it('clears the title and amount on success, but keeps category/payer/split as they were', async () => {
    const user = userEvent.setup()
    renderSection()
    await screen.findByText('Rent')

    await user.type(screen.getByPlaceholderText('Title (e.g. Rent)'), 'Gym')
    await user.type(screen.getByPlaceholderText('Amount'), '45')
    await user.selectOptions(screen.getByLabelText('Category'), 'cat-housing')
    await user.click(screen.getByRole('button', { name: 'Add subscription' }))

    expect(screen.getByPlaceholderText('Title (e.g. Rent)')).toHaveValue('')
    expect(screen.getByPlaceholderText('Amount')).toHaveValue('')
    expect(screen.getByLabelText('Category')).toHaveValue('cat-housing')
  })

  it('shows an error when adding fails', async () => {
    const user = userEvent.setup()
    mockAddRecurringBill.mockRejectedValue(new Error('could not add subscription'))
    renderSection()
    await screen.findByText('Rent')

    await user.type(screen.getByPlaceholderText('Title (e.g. Rent)'), 'Gym')
    await user.type(screen.getByPlaceholderText('Amount'), '45')
    await user.click(screen.getByRole('button', { name: 'Add subscription' }))

    expect(await screen.findByText('could not add subscription')).toBeInTheDocument()
  })
})

describe('GroupSubscriptionsSection — editing', () => {
  it('pre-fills the form from the template, switches the heading, and hides frequency/start date', async () => {
    const user = userEvent.setup()
    renderSection()
    const row = (await screen.findByText('Rent')).closest('li')

    await user.click(within(row).getByRole('button', { name: 'Actions for Rent' }))
    await user.click(within(row).getByText('Edit'))

    expect(screen.getByRole('heading', { name: 'Edit subscription' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Title (e.g. Rent)')).toHaveValue('Rent')
    expect(screen.getByPlaceholderText('Amount')).toHaveValue('1200')
    expect(screen.queryByLabelText('Repeats')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Starting')).not.toBeInTheDocument()
  })

  it('submits the edited fields via updateRecurringBill, then reloads and returns to "New subscription"', async () => {
    const user = userEvent.setup()
    renderSection()
    const row = (await screen.findByText('Rent')).closest('li')

    await user.click(within(row).getByRole('button', { name: 'Actions for Rent' }))
    await user.click(within(row).getByText('Edit'))

    const titleInput = screen.getByPlaceholderText('Title (e.g. Rent)')
    await user.clear(titleInput)
    await user.type(titleInput, 'Rent (updated)')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(mockUpdateRecurringBill).toHaveBeenCalledWith({}, 'template-rent', {
      title: 'Rent (updated)',
      amount: 1200,
      categoryId: 'cat-housing',
      paidBy: 'member-alice',
      splitMemberIds: ['member-alice', 'member-bob'],
    })
    await waitFor(() => expect(mockFetchGroupSubscriptionsData).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('heading', { name: 'New subscription' })).toBeInTheDocument()
  })

  it('cancelling an edit resets the form and the heading, without calling updateRecurringBill', async () => {
    const user = userEvent.setup()
    renderSection()
    const row = (await screen.findByText('Rent')).closest('li')

    await user.click(within(row).getByRole('button', { name: 'Actions for Rent' }))
    await user.click(within(row).getByText('Edit'))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mockUpdateRecurringBill).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'New subscription' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Title (e.g. Rent)')).toHaveValue('')
  })

  it('shows an error when saving an edit fails', async () => {
    const user = userEvent.setup()
    mockUpdateRecurringBill.mockRejectedValue(new Error('could not save changes'))
    renderSection()
    const row = (await screen.findByText('Rent')).closest('li')

    await user.click(within(row).getByRole('button', { name: 'Actions for Rent' }))
    await user.click(within(row).getByText('Edit'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('could not save changes')).toBeInTheDocument()
  })
})

describe('GroupSubscriptionsSection — pause/resume', () => {
  it('pauses an active template', async () => {
    const user = userEvent.setup()
    renderSection()
    const row = (await screen.findByText('Rent')).closest('li')

    await user.click(within(row).getByRole('button', { name: 'Actions for Rent' }))
    await user.click(within(row).getByText('Pause'))

    expect(mockSetRecurringBillActive).toHaveBeenCalledWith({}, 'template-rent', false)
  })

  it('shows "Resume" for a paused template, and resumes it on click', async () => {
    const user = userEvent.setup()
    mockFetchGroupSubscriptionsData.mockResolvedValue(dataFixture({ templates: [templateFixture({ active: false })] }))
    renderSection()
    const row = (await screen.findByText('Rent')).closest('li')

    await user.click(within(row).getByRole('button', { name: 'Actions for Rent' }))
    expect(within(row).queryByText('Pause')).not.toBeInTheDocument()
    await user.click(within(row).getByText('Resume'))

    expect(mockSetRecurringBillActive).toHaveBeenCalledWith({}, 'template-rent', true)
  })

  it('shows an error when pausing fails', async () => {
    const user = userEvent.setup()
    mockSetRecurringBillActive.mockRejectedValue(new Error('could not pause subscription'))
    renderSection()
    const row = (await screen.findByText('Rent')).closest('li')

    await user.click(within(row).getByRole('button', { name: 'Actions for Rent' }))
    await user.click(within(row).getByText('Pause'))

    expect(await screen.findByText('could not pause subscription')).toBeInTheDocument()
  })
})

describe('GroupSubscriptionsSection — deleting', () => {
  it('shows how many bills a subscription has already created before confirming', async () => {
    const user = userEvent.setup()
    mockCountRecurringBillOccurrences.mockResolvedValue({ count: 3, total: 3600 })
    renderSection()
    const row = (await screen.findByText('Rent')).closest('li')

    await user.click(within(row).getByRole('button', { name: 'Actions for Rent' }))
    await user.click(within(row).getByText('Delete'))

    expect(mockCountRecurringBillOccurrences).toHaveBeenCalledWith({}, 'template-rent')
    expect(await screen.findByText(/already created 3 bills \(totaling €3600.00\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete the bills too' })).toBeInTheDocument()
  })

  it("says a subscription hasn't created any bills yet, and hides the delete-bills-too option", async () => {
    const user = userEvent.setup()
    renderSection()
    const row = (await screen.findByText('Rent')).closest('li')

    await user.click(within(row).getByRole('button', { name: 'Actions for Rent' }))
    await user.click(within(row).getByText('Delete'))

    expect(await screen.findByText("This subscription hasn't created any bills yet.")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete the bills too' })).not.toBeInTheDocument()
  })

  it('cancels without deleting anything', async () => {
    const user = userEvent.setup()
    renderSection()
    const row = (await screen.findByText('Rent')).closest('li')

    await user.click(within(row).getByRole('button', { name: 'Actions for Rent' }))
    await user.click(within(row).getByText('Delete'))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(mockDeleteRecurringBill).not.toHaveBeenCalled()
    expect(screen.queryByText(/hasn't created any bills yet/)).not.toBeInTheDocument()
  })

  it('deletes just the template on "Keep the bills", then reloads', async () => {
    const user = userEvent.setup()
    renderSection()
    const row = (await screen.findByText('Rent')).closest('li')

    await user.click(within(row).getByRole('button', { name: 'Actions for Rent' }))
    await user.click(within(row).getByText('Delete'))
    await user.click(await screen.findByRole('button', { name: 'Keep the bills' }))

    expect(mockDeleteRecurringBill).toHaveBeenCalledWith({}, 'template-rent', false)
    await waitFor(() => expect(mockFetchGroupSubscriptionsData).toHaveBeenCalledTimes(2))
  })

  it('deletes the template and its bills on "Delete the bills too"', async () => {
    const user = userEvent.setup()
    mockCountRecurringBillOccurrences.mockResolvedValue({ count: 3, total: 3600 })
    renderSection()
    const row = (await screen.findByText('Rent')).closest('li')

    await user.click(within(row).getByRole('button', { name: 'Actions for Rent' }))
    await user.click(within(row).getByText('Delete'))
    await user.click(await screen.findByRole('button', { name: 'Delete the bills too' }))

    expect(mockDeleteRecurringBill).toHaveBeenCalledWith({}, 'template-rent', true)
  })

  it('cancels the edit in progress when deleting the template currently being edited', async () => {
    const user = userEvent.setup()
    renderSection()
    const row = (await screen.findByText('Rent')).closest('li')

    await user.click(within(row).getByRole('button', { name: 'Actions for Rent' }))
    await user.click(within(row).getByText('Edit'))
    expect(screen.getByRole('heading', { name: 'Edit subscription' })).toBeInTheDocument()

    await user.click(within(row).getByRole('button', { name: 'Actions for Rent' }))
    await user.click(within(row).getByText('Delete'))
    await user.click(await screen.findByRole('button', { name: 'Keep the bills' }))

    expect(await screen.findByRole('heading', { name: 'New subscription' })).toBeInTheDocument()
  })

  it('shows an error when the occurrence count lookup fails, without opening the modal', async () => {
    const user = userEvent.setup()
    mockCountRecurringBillOccurrences.mockRejectedValue(new Error('could not check bills'))
    renderSection()
    const row = (await screen.findByText('Rent')).closest('li')

    await user.click(within(row).getByRole('button', { name: 'Actions for Rent' }))
    await user.click(within(row).getByText('Delete'))

    expect(await screen.findByText('could not check bills')).toBeInTheDocument()
    expect(screen.queryByText(/hasn't created any bills yet/)).not.toBeInTheDocument()
  })

  it('shows an error and keeps the confirmation open when deleting fails', async () => {
    const user = userEvent.setup()
    mockDeleteRecurringBill.mockRejectedValue(new Error('could not delete subscription'))
    renderSection()
    const row = (await screen.findByText('Rent')).closest('li')

    await user.click(within(row).getByRole('button', { name: 'Actions for Rent' }))
    await user.click(within(row).getByText('Delete'))
    await user.click(await screen.findByRole('button', { name: 'Keep the bills' }))

    expect(await screen.findByText('could not delete subscription')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep the bills' })).toBeInTheDocument() // modal still open
  })
})
