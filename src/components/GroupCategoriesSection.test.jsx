import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GroupCategoriesSection from './GroupCategoriesSection'
import { groupCategoriesCache } from '../lib/groupCategoriesCache'

// Same vi.hoisted() reasoning as the other lib-function-mocked suites —
// vi.mock() factories are hoisted above ordinary variable declarations.
const { mockFetchCategories, mockAddCategory, mockRenameCategory, mockDeleteCategory, mockUpdateCategoryColor } =
  vi.hoisted(() => ({
    mockFetchCategories: vi.fn(),
    mockAddCategory: vi.fn(),
    mockRenameCategory: vi.fn(),
    mockDeleteCategory: vi.fn(),
    mockUpdateCategoryColor: vi.fn(),
  }))

// This component never touches Supabase directly at all — every read/write
// goes through lib/categories.js — so the mock boundary is that module, same
// lib-function pattern as GroupMembersSection.test.jsx. The preset
// palette ColorSwatchPicker renders comes from lib/categoryPalette.js,
// which has no Supabase import, so it's used for real rather than mocked.
vi.mock('../lib/categories', () => ({
  fetchCategories: mockFetchCategories,
  addCategory: mockAddCategory,
  renameCategory: mockRenameCategory,
  deleteCategory: mockDeleteCategory,
  updateCategoryColor: mockUpdateCategoryColor,
}))
vi.mock('react-router-dom', () => ({ useParams: () => ({ groupId: 'group-1' }) }))

function categoriesFixture() {
  return [
    { id: 'cat-groceries', name: 'Groceries', color: '#534195' },
    { id: 'cat-eating-out', name: 'Eating out', color: '#c77510' },
  ]
}

function rowFor(name) {
  return screen.getByText(name, { selector: '.category-label' }).closest('li')
}

function addCategoryForm() {
  return screen.getByPlaceholderText('New category').closest('form')
}

beforeEach(() => {
  mockFetchCategories.mockReset().mockResolvedValue(categoriesFixture())
  mockAddCategory.mockReset().mockResolvedValue({ id: 'cat-new', name: 'Health', color: '#a52030' })
  mockRenameCategory.mockReset().mockResolvedValue(undefined)
  mockDeleteCategory.mockReset().mockResolvedValue(undefined)
  mockUpdateCategoryColor.mockReset().mockResolvedValue(undefined)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  // Same reasoning as groupRosterCache.clear() elsewhere — this component
  // seeds its initial state straight from the shared, module-level
  // groupCategoriesCache, so a previous test's load() would otherwise leak
  // into this one's first render.
  groupCategoriesCache.clear()
})

describe('GroupCategoriesSection — loading', () => {
  it('paints from groupCategoriesCache before the fetch even resolves', () => {
    groupCategoriesCache.set('group-1', categoriesFixture())
    mockFetchCategories.mockReturnValue(new Promise(() => {})) // never resolves this test

    render(<GroupCategoriesSection />)

    // No `await`/`findBy` — asserts the *first* render already has it,
    // seeded from the cache, not the still-pending fetch above.
    expect(screen.getByText('Groceries', { selector: '.category-label' })).toBeInTheDocument()
  })

  it('loads and lists categories, then caches them', async () => {
    render(<GroupCategoriesSection />)

    expect(await screen.findByText('Groceries', { selector: '.category-label' })).toBeInTheDocument()
    expect(screen.getByText('Eating out', { selector: '.category-label' })).toBeInTheDocument()
    expect(mockFetchCategories).toHaveBeenCalledWith('group-1')
    expect(groupCategoriesCache.get('group-1')).toEqual(categoriesFixture())
  })

  it('shows an error, keeping the cached list, when loading fails', async () => {
    groupCategoriesCache.set('group-1', categoriesFixture())
    mockFetchCategories.mockRejectedValue({ message: 'Failed to fetch' })
    render(<GroupCategoriesSection />)

    expect(await screen.findByText(/Couldn't load categories/)).toBeInTheDocument()
    expect(screen.getByText('Groceries', { selector: '.category-label' })).toBeInTheDocument()
  })
})

describe('GroupCategoriesSection — add category', () => {
  it('disables submit until a name is entered', async () => {
    const user = userEvent.setup({ delay: null })
    render(<GroupCategoriesSection />)
    await screen.findByText('Groceries', { selector: '.category-label' })

    expect(screen.getByRole('button', { name: 'Add category' })).toBeDisabled()
    await user.type(screen.getByPlaceholderText('New category'), 'Health')
    expect(screen.getByRole('button', { name: 'Add category' })).not.toBeDisabled()
  })

  it('adds a category with the default preset color, then reloads', async () => {
    const user = userEvent.setup({ delay: null })
    render(<GroupCategoriesSection />)
    await screen.findByText('Groceries', { selector: '.category-label' })

    await user.type(screen.getByPlaceholderText('New category'), 'Health')
    await user.click(screen.getByRole('button', { name: 'Add category' }))

    expect(mockAddCategory).toHaveBeenCalledWith('group-1', 'Health', '#534195')
    expect(screen.getByPlaceholderText('New category')).toHaveValue('') // cleared on success
    await waitForCallCount(mockFetchCategories, 2) // initial load + reload after add
  })

  it('adds a category with a chosen preset color', async () => {
    const user = userEvent.setup({ delay: null })
    render(<GroupCategoriesSection />)
    await screen.findByText('Groceries', { selector: '.category-label' })

    await user.click(within(addCategoryForm()).getByLabelText('Choose color #a52030'))
    await user.type(screen.getByPlaceholderText('New category'), 'Health')
    await user.click(screen.getByRole('button', { name: 'Add category' }))

    expect(mockAddCategory).toHaveBeenCalledWith('group-1', 'Health', '#a52030')
  })

  it('shows an error and keeps the typed name when adding fails', async () => {
    const user = userEvent.setup({ delay: null })
    mockAddCategory.mockRejectedValue(new Error('could not add category'))
    render(<GroupCategoriesSection />)
    await screen.findByText('Groceries', { selector: '.category-label' })

    await user.type(screen.getByPlaceholderText('New category'), 'Health')
    await user.click(screen.getByRole('button', { name: 'Add category' }))

    expect(await screen.findByText('could not add category')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('New category')).toHaveValue('Health')
  })
})

describe('GroupCategoriesSection — rename', () => {
  it('renames a category on submit, then reloads', async () => {
    const user = userEvent.setup({ delay: null })
    render(<GroupCategoriesSection />)
    await screen.findByText('Groceries', { selector: '.category-label' })
    const row = rowFor('Groceries')

    await user.click(within(row).getByRole('button', { name: 'Actions for Groceries' }))
    await user.click(within(row).getByText('Rename'))

    const input = within(row).getByDisplayValue('Groceries')
    await user.clear(input)
    await user.type(input, 'Supermarket')
    await user.click(within(row).getByRole('button', { name: 'Save' }))

    expect(mockRenameCategory).toHaveBeenCalledWith('cat-groceries', 'Supermarket')
    await waitForCallCount(mockFetchCategories, 2)
  })

  it('cancels a rename without calling renameCategory', async () => {
    const user = userEvent.setup({ delay: null })
    render(<GroupCategoriesSection />)
    await screen.findByText('Groceries', { selector: '.category-label' })
    const row = rowFor('Groceries')

    await user.click(within(row).getByRole('button', { name: 'Actions for Groceries' }))
    await user.click(within(row).getByText('Rename'))
    await user.click(within(row).getByRole('button', { name: 'Cancel' }))

    expect(mockRenameCategory).not.toHaveBeenCalled()
    expect(screen.getByText('Groceries', { selector: '.category-label' })).toBeInTheDocument()
  })

  it('shows an error when renaming fails', async () => {
    const user = userEvent.setup({ delay: null })
    mockRenameCategory.mockRejectedValue(new Error('could not rename category'))
    render(<GroupCategoriesSection />)
    await screen.findByText('Groceries', { selector: '.category-label' })
    const row = rowFor('Groceries')

    await user.click(within(row).getByRole('button', { name: 'Actions for Groceries' }))
    await user.click(within(row).getByText('Rename'))
    await user.click(within(row).getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('could not rename category')).toBeInTheDocument()
  })
})

describe('GroupCategoriesSection — color change', () => {
  it('applies a color change optimistically, before the write resolves', async () => {
    const user = userEvent.setup({ delay: null })
    mockUpdateCategoryColor.mockReturnValue(new Promise(() => {})) // never resolves this test
    render(<GroupCategoriesSection />)
    await screen.findByText('Groceries', { selector: '.category-label' })
    const row = rowFor('Groceries')

    await user.click(within(row).getByLabelText('Change category color'))
    await user.click(within(row).getByLabelText('Choose color #c77510'))

    expect(mockUpdateCategoryColor).toHaveBeenCalledWith('cat-groceries', '#c77510')
    // The popover stays open after a pick (see CategoryColorButton's own
    // comment) — its ColorSwatchPicker is handed the category's own color
    // as `value`, so which swatch now shows "selected" is a reliable proxy
    // for the (optimistically updated) state, without relying on jsdom's
    // lossy inline-style-to-computed-style color normalization.
    expect(within(row).getByLabelText('Choose color #c77510')).toHaveClass('selected')
  })

  it('reverts the color and shows an error when the write fails', async () => {
    const user = userEvent.setup({ delay: null })
    mockUpdateCategoryColor.mockRejectedValue(new Error('could not change color'))
    render(<GroupCategoriesSection />)
    await screen.findByText('Groceries', { selector: '.category-label' })
    const row = rowFor('Groceries')

    await user.click(within(row).getByLabelText('Change category color'))
    await user.click(within(row).getByLabelText('Choose color #c77510'))

    expect(await screen.findByText('could not change color')).toBeInTheDocument()
    expect(within(row).getByLabelText('Choose color #534195')).toHaveClass('selected') // reverted
  })
})

describe('GroupCategoriesSection — delete', () => {
  it('deletes a category on confirm, then reloads', async () => {
    const user = userEvent.setup({ delay: null })
    render(<GroupCategoriesSection />)
    await screen.findByText('Groceries', { selector: '.category-label' })
    const row = rowFor('Groceries')

    await user.click(within(row).getByRole('button', { name: 'Actions for Groceries' }))
    await user.click(within(row).getByText('Delete'))

    expect(mockDeleteCategory).toHaveBeenCalledWith('cat-groceries')
    await waitForCallCount(mockFetchCategories, 2)
  })

  it('does not delete when the confirm is cancelled', async () => {
    const user = userEvent.setup({ delay: null })
    window.confirm.mockReturnValue(false)
    render(<GroupCategoriesSection />)
    await screen.findByText('Groceries', { selector: '.category-label' })
    const row = rowFor('Groceries')

    await user.click(within(row).getByRole('button', { name: 'Actions for Groceries' }))
    await user.click(within(row).getByText('Delete'))

    expect(mockDeleteCategory).not.toHaveBeenCalled()
  })

  it('shows an error when deleting fails', async () => {
    const user = userEvent.setup({ delay: null })
    mockDeleteCategory.mockRejectedValue(new Error('could not delete category'))
    render(<GroupCategoriesSection />)
    await screen.findByText('Groceries', { selector: '.category-label' })
    const row = rowFor('Groceries')

    await user.click(within(row).getByRole('button', { name: 'Actions for Groceries' }))
    await user.click(within(row).getByText('Delete'))

    expect(await screen.findByText('could not delete category')).toBeInTheDocument()
  })
})

// mockFetchCategories fires again (fire-and-forget, not awaited by the
// component) after every add/rename/delete — waitFor-style helper so those
// tests don't need to import waitFor just for a call-count check.
async function waitForCallCount(mockFn, count) {
  await vi.waitFor(() => expect(mockFn).toHaveBeenCalledTimes(count))
}
