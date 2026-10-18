import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BillDetails from './BillDetails'

const { mockUpdate } = vi.hoisted(() => ({ mockUpdate: vi.fn() }))
vi.mock('../supabaseClient', () => ({
  supabase: { from: () => ({ update: (patch) => ({ eq: () => mockUpdate(patch) }) }) },
}))

const MEMBERS = [
  { id: 'm-alice', name: 'Alice', active: true },
  { id: 'm-bob', name: 'Bob', active: true },
]
const CATEGORIES = [{ id: 'cat-food', name: 'Groceries', color: '#534195' }]
const GROUP = { is_personal: false }

function bill(overrides = {}) {
  return {
    id: 'bill-1',
    title: 'Lidl',
    note: 'Weekly shop',
    paid_by: 'm-alice',
    category_id: 'cat-food',
    created_at: '2026-10-14T12:00:00Z',
    ...overrides,
  }
}

function details(props = {}) {
  return (
    <BillDetails
      billId="bill-1"
      bill={bill()}
      group={GROUP}
      billPayers={[]}
      members={MEMBERS}
      activeMembers={MEMBERS}
      categories={CATEGORIES}
      defaultBuyerIds={['m-alice', 'm-bob']}
      showNextItemSplit
      avatarSize="md"
      onPaidBySelect={vi.fn()}
      onOpenPayers={vi.fn()}
      onCategoryChange={vi.fn()}
      onToggleDefaultBuyer={vi.fn()}
      onOnlyDefaultBuyer={vi.fn()}
      onDateSave={vi.fn()}
      setError={vi.fn()}
      {...props}
    />
  )
}

describe('BillDetails', () => {
  it('sums the bill up in one line', () => {
    render(details())
    expect(screen.getByText(/^Paid by Alice · Groceries · .+ · note added$/)).toBeInTheDocument()
  })

  it('says how many paid on a split bill, and leaves payers out of a personal space', () => {
    const { rerender } = render(
      details({ billPayers: [{ member_id: 'm-alice', amount: 5 }, { member_id: 'm-bob', amount: 5 }] })
    )
    expect(screen.getByText(/^Split 2 ways · /)).toBeInTheDocument()
    rerender(details({ group: { is_personal: true } }))
    expect(screen.getByText(/^Groceries · /)).toBeInTheDocument()
    expect(screen.queryByText('Paid by')).not.toBeInTheDocument()
  })

  it('keeps the note being typed when the bill refreshes, and takes the next bill’s own note', async () => {
    const user = userEvent.setup()
    const { rerender } = render(details())
    const note = screen.getByPlaceholderText(/Add a note/)
    await user.clear(note)
    await user.type(note, 'Half was for the party')
    rerender(details({ bill: bill({ paid_by: 'm-bob' }) }))
    expect(note).toHaveValue('Half was for the party')
    rerender(details({ billId: 'bill-2', bill: bill({ id: 'bill-2', note: null }) }))
    expect(screen.getByPlaceholderText(/Add a note/)).toHaveValue('')
  })

  it('saves the note when you leave it', async () => {
    mockUpdate.mockResolvedValue({ error: null })
    const user = userEvent.setup()
    render(details())
    await user.type(screen.getByPlaceholderText(/Add a note/), '!')
    await user.tab()
    expect(mockUpdate).toHaveBeenCalledWith({ note: 'Weekly shop!' })
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })
})
