import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BudgetsSection from './BudgetsSection'
import { budgetsCache } from '../lib/budgetsCache'

// Same vi.hoisted() reasoning as every other lib-function-mocked suite —
// vi.mock() factories are hoisted above ordinary variable declarations.
const { mockFetchBudgetsData, mockSaveThreshold, mockDeleteThreshold } = vi.hoisted(() => ({
  mockFetchBudgetsData: vi.fn(),
  mockSaveThreshold: vi.fn(),
  mockDeleteThreshold: vi.fn(),
}))

// This component's own load goes through one combined lib function
// (fetchBudgetsData); its two writes (save/delete a single category's
// budget) go through lib/thresholds.js directly. Same "mock the lib
// boundary, not supabaseClient" idea as every other lib-function suite —
// neither module here builds its own Supabase query chain.
vi.mock('../lib/prefetchSettings', () => ({ fetchBudgetsData: mockFetchBudgetsData }))
vi.mock('../lib/thresholds', () => ({ saveThreshold: mockSaveThreshold, deleteThreshold: mockDeleteThreshold }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-me' } }) }))
// lib/categories.js also exports fetchCategories/etc., which import
// supabaseClient.js — importing the real module (even just for
// DEFAULT_CATEGORIES) would hit createClient() with no env vars configured
// in tests. Same workaround GroupCategoriesSection.test.jsx already uses
// for CATEGORY_COLORS: inline the real values as a plain literal instead
// of reaching for vi.importActual().
vi.mock('../lib/categories', () => ({
  DEFAULT_CATEGORIES: [
    { name: 'Groceries', color: '#4a86e8' },
    { name: 'Eating out', color: '#e69138' },
    { name: 'Household', color: '#6aa84f' },
    { name: 'Bills & utilities', color: '#a479e2' },
    { name: 'Transport', color: '#45818e' },
    { name: 'Health', color: '#cc4125' },
    { name: 'Other', color: '#999999' },
  ],
}))

function dataFixture(overrides = {}) {
  return {
    customCategories: [],
    // Groceries' real DEFAULT_CATEGORIES row, seeded with a monthly figure
    // that doesn't divide evenly by 4 — the same €10.10-style case
    // budgetPeriod.test.js covers directly, exercised here through the
    // actual rendered input instead of the pure function alone.
    thresholdByKey: new Map([['groceries', { category_name: 'Groceries', amount: 250 }]]),
    ...overrides,
  }
}

function groceriesInput() {
  return within(screen.getByText('Groceries').closest('li')).getByRole('textbox')
}

beforeEach(() => {
  mockFetchBudgetsData.mockReset().mockResolvedValue(dataFixture())
  mockSaveThreshold.mockReset().mockResolvedValue(undefined)
  mockDeleteThreshold.mockReset().mockResolvedValue(undefined)
  // budgetPeriod lives in the same real, localStorage-backed
  // statsPreferences.js module every other per-device preference in this
  // suite uses directly rather than mocking (same treatment as
  // groupViewPreferences.js elsewhere) — cleared here so one test's choice
  // doesn't leak into the next.
  localStorage.clear()
  // This component seeds its initial category/threshold state from the
  // shared, module-level budgetsCache — cleared here so a previous test's
  // load() can't leak into the next one's first render, same reasoning as
  // groupRosterCache/groupCategoriesCache elsewhere in this suite.
  budgetsCache.clear()
})

describe('BudgetsSection — period control', () => {
  it('defaults to Month, with the monthly comparison copy and no rounding note', async () => {
    render(<BudgetsSection />)
    await screen.findByText('Groceries')

    expect(screen.getByRole('button', { name: 'Month' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Week' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText(/this calendar month/)).toBeInTheDocument()
    expect(screen.queryByText(/divided by 4/)).not.toBeInTheDocument()
  })

  it('switching to Week shows the weekly comparison copy and the rounding note', async () => {
    const user = userEvent.setup()
    render(<BudgetsSection />)
    await screen.findByText('Groceries')

    await user.click(screen.getByRole('button', { name: 'Week' }))

    expect(screen.getByRole('button', { name: 'Week' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/the current week \(Monday–Sunday\)/)).toBeInTheDocument()
    expect(screen.getByText(/divided by 4/)).toBeInTheDocument()
  })

  it('persists the chosen period to the real statsPreferences module', async () => {
    const user = userEvent.setup()
    render(<BudgetsSection />)
    await screen.findByText('Groceries')

    await user.click(screen.getByRole('button', { name: 'Week' }))

    expect(JSON.parse(localStorage.getItem('spesa-stats-preferences')).budgetPeriod).toBe('week')
  })
})

describe('BudgetsSection — displaying an existing budget', () => {
  it('shows the stored monthly amount unchanged in month mode', async () => {
    render(<BudgetsSection />)
    await screen.findByText('Groceries')

    expect(groceriesInput()).toHaveValue('250')
  })

  it('shows the amount divided by 4 (and rounded) once switched to week', async () => {
    const user = userEvent.setup()
    // 250 isn't evenly divisible by 4 to the cent — 62.5 exactly, in this
    // case, but still exercises the same monthlyToDisplayAmount() path
    // budgetPeriod.test.js covers directly.
    render(<BudgetsSection />)
    await screen.findByText('Groceries')

    await user.click(screen.getByRole('button', { name: 'Week' }))

    expect(groceriesInput()).toHaveValue('62.5')
  })
})

describe('BudgetsSection — saving an edit', () => {
  it('saves a typed amount unchanged while in month mode', async () => {
    const user = userEvent.setup()
    render(<BudgetsSection />)
    await screen.findByText('Groceries')

    const input = groceriesInput()
    await user.clear(input)
    await user.type(input, '300')
    fireEvent.blur(input)

    expect(mockSaveThreshold).toHaveBeenCalledWith('user-me', 'Groceries', 300)
  })

  it('multiplies a typed weekly amount by 4 before saving the monthly figure', async () => {
    const user = userEvent.setup()
    render(<BudgetsSection />)
    await screen.findByText('Groceries')
    await user.click(screen.getByRole('button', { name: 'Week' }))

    const input = groceriesInput()
    await user.clear(input)
    await user.type(input, '70')
    fireEvent.blur(input)

    expect(mockSaveThreshold).toHaveBeenCalledWith('user-me', 'Groceries', 280)
  })

  it('can drift the saved monthly amount by a cent or two re-saving an already-rounded weekly display — the documented edge case', async () => {
    // Same €10.10/month -> €2.53/week (rounded from 2.525) case
    // budgetPeriod.test.js exercises directly on the pure functions —
    // reproduced here end-to-end through the real component.
    mockFetchBudgetsData.mockResolvedValue(
      dataFixture({ thresholdByKey: new Map([['groceries', { category_name: 'Groceries', amount: 10.1 }]]) })
    )
    const user = userEvent.setup()
    render(<BudgetsSection />)
    await screen.findByText('Groceries')
    await user.click(screen.getByRole('button', { name: 'Week' }))

    const input = groceriesInput()
    expect(input).toHaveValue('2.53')

    // Re-typing the exact displayed figure and blurring — a plain
    // untouched blur is a no-op (see saveRow's own `key in drafts` guard),
    // so this is the realistic "opened the field, saw 2.53, re-entered it"
    // case the warning note is actually about.
    await user.clear(input)
    await user.type(input, '2.53')
    fireEvent.blur(input)

    expect(mockSaveThreshold).toHaveBeenCalledWith('user-me', 'Groceries', 10.12)
  })

  it('deletes the budget when cleared, regardless of period', async () => {
    const user = userEvent.setup()
    render(<BudgetsSection />)
    await screen.findByText('Groceries')
    await user.click(screen.getByRole('button', { name: 'Week' }))

    const input = groceriesInput()
    await user.clear(input)
    fireEvent.blur(input)

    expect(mockDeleteThreshold).toHaveBeenCalledWith('user-me', 'Groceries')
    expect(mockSaveThreshold).not.toHaveBeenCalled()
  })

  it('rejects a zero or negative typed amount the same way in either period', async () => {
    const user = userEvent.setup()
    render(<BudgetsSection />)
    await screen.findByText('Groceries')

    const input = groceriesInput()
    await user.clear(input)
    await user.type(input, '0')
    fireEvent.blur(input)

    expect(await screen.findByText('"0" isn\'t a valid budget amount.')).toBeInTheDocument()
    expect(mockSaveThreshold).not.toHaveBeenCalled()
  })
})
