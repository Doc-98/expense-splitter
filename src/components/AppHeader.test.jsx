import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AppHeader from './AppHeader'

// Same vi.hoisted() reasoning as the other Supabase/context-coupled
// suites — vi.mock() factories are hoisted above ordinary variable
// declarations.
const { mockUseAuth, mockPrefetchSettingsGroups, mockPrefetchBudgets } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockPrefetchSettingsGroups: vi.fn(),
  mockPrefetchBudgets: vi.fn(),
}))

// AppHeader itself never touches Supabase — it only reads useAuth() and
// fires two prefetch functions on click — so those are the mock boundary,
// same "mock the lib functions, not supabaseClient" idea as
// GroupMembersSection.test.jsx. react-router-dom's Link is stubbed the
// same way RecordPayment.test.jsx's first needed it: a plain <a> so
// `getByRole('link', …)` works without a real <MemoryRouter>.
vi.mock('../context/AuthContext', () => ({ useAuth: () => mockUseAuth() }))
vi.mock('../lib/prefetchSettings', () => ({
  prefetchSettingsGroups: mockPrefetchSettingsGroups,
  prefetchBudgets: mockPrefetchBudgets,
}))
vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

beforeEach(() => {
  mockUseAuth.mockReset().mockReturnValue({ user: { id: 'user-me' }, displayName: 'Marco' })
  mockPrefetchSettingsGroups.mockReset()
  mockPrefetchBudgets.mockReset()
})

describe('AppHeader', () => {
  it('links the brand to home and shows a version chip', () => {
    render(<AppHeader />)
    const brand = screen.getByRole('link', { name: /Expense Splitter/ })
    expect(brand).toHaveAttribute('href', '/')
  })

  it("links the account chip to Settings, showing the user's display name", () => {
    render(<AppHeader />)
    const chip = screen.getByRole('link', { name: 'Marco' })
    expect(chip).toHaveAttribute('href', '/settings')
  })

  it('falls back to "…" for the account chip while displayName is not yet known', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'user-me' }, displayName: null })
    render(<AppHeader />)
    expect(screen.getByRole('link', { name: '…' })).toBeInTheDocument()
  })

  it('fires both Settings prefetches, with the current user id, on account chip click', async () => {
    const user = userEvent.setup()
    render(<AppHeader />)

    await user.click(screen.getByRole('link', { name: 'Marco' }))

    expect(mockPrefetchSettingsGroups).toHaveBeenCalledWith('user-me')
    expect(mockPrefetchBudgets).toHaveBeenCalledWith('user-me')
  })
})
