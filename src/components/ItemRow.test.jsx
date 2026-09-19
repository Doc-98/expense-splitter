import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ItemRow from './ItemRow'
import { CurrencyProvider } from '../context/CurrencyContext'

// CurrencyContext is the first context in this suite worth wrapping for
// real rather than mocking useCurrency() — unlike AuthContext/ThemeContext,
// CurrencyProvider never touches Supabase or any browser API beyond
// localStorage (already real/cleared elsewhere in this suite), so there's
// nothing to mock and real coverage of format() itself is a bonus, not a
// risk.
function renderItemRow(props) {
  return render(
    <CurrencyProvider>
      <ItemRow
        members={MEMBERS}
        categories={CATEGORIES}
        billCategoryId="cat-food"
        onToggleBuyer={vi.fn()}
        onDelete={vi.fn()}
        onCategoryChange={vi.fn()}
        onUpdate={vi.fn()}
        bindSwipe={vi.fn(() => ({ deleteButton: {}, row: {} }))}
        {...props}
      />
    </CurrencyProvider>
  )
}

// Supabase returns numeric columns as strings, not numbers (see this
// component's own comment) — fixtures use strings here deliberately, the
// same way real data arrives, rather than pre-converting them away.
function makeItem(overrides = {}) {
  return {
    id: 'item-1',
    name: 'Pizza',
    quantity: '1',
    unit_price: '10.00',
    total_price: '10.00',
    category_id: null,
    item_shares: [],
    ...overrides,
  }
}

const CATEGORIES = [
  { id: 'cat-food', name: 'Food', color: '#ff0000' },
  { id: 'cat-drinks', name: 'Drinks', color: '#00ff00' },
]
const MEMBERS = [
  { id: 'member-alice', name: 'Alice', avatarIcon: null, isGuest: false, active: true },
  { id: 'member-bob', name: 'Bob', avatarIcon: null, isGuest: false, active: true },
  { id: 'member-carol', name: 'Carol', avatarIcon: null, isGuest: false, active: false },
]

// The item body sits behind a CSS-only .xwrap/.xinner collapse (same
// pattern used elsewhere in this app) rather than being conditionally
// rendered, so it's always present in the DOM — "Pizza" alone matches
// both the collapsed head's name span *and* the expanded body's rename
// button. Scoped to the head's own span to disambiguate; the click still
// bubbles up to the row-head button that actually toggles `open`.
async function openRow(user) {
  await user.click(screen.getByText('Pizza', { selector: '.item-name' }))
}

describe('ItemRow — collapsed view', () => {
  it('shows the item name and formatted total price', () => {
    renderItemRow({ item: makeItem({ total_price: '12.5' }) })
    expect(screen.getByText('Pizza', { selector: '.item-name' })).toBeInTheDocument()
    expect(screen.getByText('€12.50', { selector: '.item-price' })).toBeInTheDocument()
  })

  it('shows a quantity badge only when quantity is not 1', () => {
    const { rerender } = renderItemRow({ item: makeItem({ quantity: '1' }) })
    expect(screen.queryByText(/×/)).not.toBeInTheDocument()

    rerender(
      <CurrencyProvider>
        <ItemRow
          item={makeItem({ quantity: '3' })}
          members={MEMBERS}
          categories={CATEGORIES}
          billCategoryId="cat-food"
          onToggleBuyer={vi.fn()}
          onDelete={vi.fn()}
          onCategoryChange={vi.fn()}
          onUpdate={vi.fn()}
          bindSwipe={vi.fn(() => ({ deleteButton: {}, row: {} }))}
        />
      </CurrencyProvider>
    )
    expect(screen.getByText('3×')).toBeInTheDocument()
  })

  it("falls back to the bill's category when the item has none of its own", () => {
    renderItemRow({ item: makeItem({ category_id: null }) })
    expect(screen.getByTitle('Food')).toBeInTheDocument()
  })

  it("shows the item's own category over the bill's when it has one", () => {
    renderItemRow({ item: makeItem({ category_id: 'cat-drinks' }) })
    expect(screen.getByTitle('Drinks')).toBeInTheDocument()
  })

  it("shows an unassigned warning dot when no one's assigned", () => {
    renderItemRow({ item: makeItem({ item_shares: [] }) })
    expect(screen.getByTitle("No one's assigned yet")).toBeInTheDocument()
  })

  it('hides the unassigned dot once hideBuyers is set, even with no assignees', () => {
    renderItemRow({ item: makeItem({ item_shares: [] }), hideBuyers: true })
    expect(screen.queryByTitle("No one's assigned yet")).not.toBeInTheDocument()
  })

  it('hides the unassigned dot when someone is assigned', () => {
    renderItemRow({ item: makeItem({ item_shares: [{ member_id: 'member-alice' }] }) })
    expect(screen.queryByTitle("No one's assigned yet")).not.toBeInTheDocument()
  })
})

describe('ItemRow — expanding and editing', () => {
  it('expands the row on click', async () => {
    const user = userEvent.setup()
    const { container } = renderItemRow({ item: makeItem() })
    expect(container.querySelector('.item-row')).not.toHaveClass('is-open')

    await openRow(user)
    expect(container.querySelector('.item-row')).toHaveClass('is-open')
  })

  it('renames the item on commit', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    renderItemRow({ item: makeItem(), onUpdate })
    await openRow(user)

    await user.click(screen.getByRole('button', { name: 'Rename Pizza' }))
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'Calzone')
    await user.keyboard('{Enter}')

    expect(onUpdate).toHaveBeenCalledWith('name', 'Calzone')
  })

  it('only shows the unit price field when quantity is not 1', async () => {
    const user = userEvent.setup()
    renderItemRow({ item: makeItem({ quantity: '1' }) })
    await openRow(user)
    expect(screen.queryByRole('button', { name: 'Unit price of Pizza' })).not.toBeInTheDocument()
  })

  it('saves a valid unit price, including a typed expression', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    renderItemRow({ item: makeItem({ quantity: '2' }), onUpdate })
    await openRow(user)

    await user.click(screen.getByRole('button', { name: 'Unit price of Pizza' }))
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), '2,30-1,25')
    await user.keyboard('{Enter}')

    expect(onUpdate).toHaveBeenCalledWith('unit_price', 1.05)
  })

  it('ignores an unparseable unit price', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    renderItemRow({ item: makeItem({ quantity: '2' }), onUpdate })
    await openRow(user)

    await user.click(screen.getByRole('button', { name: 'Unit price of Pizza' }))
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'abc')
    await user.keyboard('{Enter}')

    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('saves a valid quantity and ignores a zero or negative one', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    renderItemRow({ item: makeItem(), onUpdate })
    await openRow(user)

    await user.click(screen.getByRole('button', { name: 'Quantity of Pizza' }))
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), '0')
    await user.keyboard('{Enter}')
    expect(onUpdate).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Quantity of Pizza' }))
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), '4')
    await user.keyboard('{Enter}')
    expect(onUpdate).toHaveBeenCalledWith('quantity', 4)
  })

  it('saves a valid total price', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    renderItemRow({ item: makeItem(), onUpdate })
    await openRow(user)

    await user.click(screen.getByRole('button', { name: 'Total price of Pizza' }))
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), '15.50')
    await user.keyboard('{Enter}')

    expect(onUpdate).toHaveBeenCalledWith('total_price', 15.5)
  })
})

describe('ItemRow — split with', () => {
  it('toggles a buyer on click', async () => {
    const user = userEvent.setup()
    const onToggleBuyer = vi.fn()
    renderItemRow({ item: makeItem(), onToggleBuyer })
    await openRow(user)

    await user.click(screen.getByRole('button', { name: 'Alice' }))
    expect(onToggleBuyer).toHaveBeenCalledWith('member-alice')
  })

  it('marks an assigned buyer active', async () => {
    const user = userEvent.setup()
    renderItemRow({ item: makeItem({ item_shares: [{ member_id: 'member-alice' }] }) })
    await openRow(user)
    expect(screen.getByRole('button', { name: 'Alice' })).toHaveClass('active')
    expect(screen.getByRole('button', { name: 'Bob' })).not.toHaveClass('active')
  })

  it('keeps a former member visible (marked "former") if already assigned, but hides other former members', async () => {
    const user = userEvent.setup()
    renderItemRow({ item: makeItem({ item_shares: [{ member_id: 'member-carol' }] }) })
    await openRow(user)
    expect(screen.getByRole('button', { name: 'Carol (left)' })).toHaveClass('former')
  })

  it('hides an inactive member entirely when not already assigned', async () => {
    const user = userEvent.setup()
    renderItemRow({ item: makeItem({ item_shares: [] }) })
    await openRow(user)
    expect(screen.queryByRole('button', { name: /Carol/ })).not.toBeInTheDocument()
  })

  it('hides the split-with section entirely when hideBuyers is set', async () => {
    const user = userEvent.setup()
    renderItemRow({ item: makeItem(), hideBuyers: true })
    await openRow(user)
    expect(screen.queryByText('Split with')).not.toBeInTheDocument()
  })
})

describe('ItemRow — category and delete', () => {
  it('labels the default option "Same as bill (<name>)" and switches on selection', async () => {
    const user = userEvent.setup()
    const onCategoryChange = vi.fn()
    renderItemRow({ item: makeItem({ category_id: null }), onCategoryChange })
    await openRow(user)

    expect(screen.getByText('Same as bill (Food)')).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox'), 'cat-drinks')
    expect(onCategoryChange).toHaveBeenCalledWith('cat-drinks')
  })

  it('hides the category picker when there are no categories', async () => {
    const user = userEvent.setup()
    renderItemRow({ item: makeItem(), categories: [] })
    await openRow(user)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('deletes the item via the Remove item button', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    renderItemRow({ item: makeItem(), onDelete })
    await openRow(user)

    await user.click(screen.getByRole('button', { name: 'Remove item' }))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('wires up swipe-to-delete with the item id and delete handler', () => {
    const onDelete = vi.fn()
    const bindSwipe = vi.fn(() => ({ deleteButton: {}, row: {} }))
    renderItemRow({ item: makeItem({ id: 'item-42' }), onDelete, bindSwipe })
    expect(bindSwipe).toHaveBeenCalledWith('item-42', onDelete)
  })
})
