import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BillView from './BillView'
import { CurrencyProvider } from '../context/CurrencyContext'

// Who splits a one-item bill: set right on the amount card, no detour
// through "Add another item" — and that item's split carries over as the
// next item's default once the bill is itemized.
const { writes, db, mockFetchAllGroupMembers } = vi.hoisted(() => ({
  writes: [],
  db: {},
  mockFetchAllGroupMembers: vi.fn(),
}))

// Writes land in `db`, so the reload that follows a write sees them.
function apply({ table, op, payload, filters }) {
  const matches = (row) =>
    filters.every(([kind, col, val]) => (kind === 'eq' ? row[col] === val : row[col] !== val))
  if (table === 'bills' && op === 'update') Object.assign(db.bill, payload)
  if (table !== 'item_shares') return
  for (const item of db.items) {
    const withItem = (share) => ({ ...share, item_id: item.id })
    if (op === 'delete') item.item_shares = item.item_shares.filter((sh) => !matches(withItem(sh)))
    if ((op === 'insert' || op === 'upsert') && payload.item_id === item.id) {
      if (!item.item_shares.some((sh) => sh.member_id === payload.member_id))
        item.item_shares.push({ member_id: payload.member_id, shares: payload.shares })
    }
  }
}

// A small stand-in for supabase-js's query builder: records every write
// (table, operation, payload, filters) and answers reads from `db`.
function query(table) {
  const q = { table, op: 'select', payload: null, filters: [] }
  const result = () => {
    if (q.op !== 'select') {
      writes.push({ table: q.table, op: q.op, payload: q.payload, filters: q.filters })
      apply(q)
      return { data: null, error: null }
    }
    if (table === 'bills') return { data: db.bill, error: null }
    if (table === 'groups') return { data: { is_personal: false }, error: null }
    if (table === 'items') return { data: structuredClone(db.items), error: null }
    return { data: [], error: null }
  }
  const chain = {
    select: () => chain,
    order: () => chain,
    eq: (col, val) => (q.filters.push(['eq', col, val]), chain),
    neq: (col, val) => (q.filters.push(['neq', col, val]), chain),
    single: () => chain,
    insert: (payload) => ((q.op = 'insert'), (q.payload = payload), chain),
    update: (payload) => ((q.op = 'update'), (q.payload = payload), chain),
    upsert: (payload) => ((q.op = 'upsert'), (q.payload = payload), chain),
    delete: () => ((q.op = 'delete'), chain),
    then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
  }
  return chain
}

vi.mock('../supabaseClient', () => {
  const channel = { on: () => channel, subscribe: () => channel }
  return {
    supabase: { from: (table) => query(table), channel: () => channel, removeChannel: () => {} },
  }
})
vi.mock('../lib/members', () => ({ fetchAllGroupMembers: mockFetchAllGroupMembers }))
vi.mock('../lib/categories', () => ({ fetchCategories: async () => [] }))
vi.mock('../components/ScanReceiptButton', () => ({ default: () => null }))
vi.mock('../components/PrintableRecap', () => ({ PrintableBillRecap: () => null }))
vi.mock('react-router-dom', () => ({
  useParams: () => ({ groupId: 'group-1', billId: 'bill-1' }),
  useNavigate: () => vi.fn(),
  Link: ({ to, children, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

const MEMBERS = [
  { id: 'm-alice', name: 'Alice', active: true, isGuest: false },
  { id: 'm-bob', name: 'Bob', active: true, isGuest: false },
  { id: 'm-carl', name: 'Carl', active: true, isGuest: false },
]
const shares = (...ids) => ids.map((member_id) => ({ member_id, shares: 1 }))

beforeEach(() => {
  writes.length = 0
  window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  mockFetchAllGroupMembers.mockResolvedValue(MEMBERS)
  db.bill = {
    id: 'bill-1',
    title: 'Dinner',
    note: '',
    paid_by: 'm-alice',
    category_id: null,
    default_buyer_ids: null,
    created_at: '2026-09-27T20:00:00Z',
    bill_payers: [],
  }
  db.items = [
    {
      id: 'item-1',
      name: 'Dinner',
      unit_price: '30.00',
      quantity: '1',
      total_price: '30.00',
      category_id: null,
      item_shares: shares('m-alice', 'm-bob', 'm-carl'),
    },
  ]
})

async function renderBill() {
  const user = userEvent.setup({ delay: null })
  render(
    <CurrencyProvider>
      <BillView />
    </CurrencyProvider>
  )
  const card = await waitFor(() => {
    const el = document.querySelector('.amount-card')
    if (!el || !within(el).queryByRole('button', { name: 'Bob' })) throw new Error('not loaded')
    return el
  })
  return { user, card: within(card) }
}

const pressed = (button) => button.getAttribute('aria-pressed') === 'true'

describe('a one-item bill', () => {
  it('shows who splits it on the amount card, and no "Next item split with" row', async () => {
    const { card } = await renderBill()
    expect(card.getByText('Split with')).toBeInTheDocument()
    expect(['Alice', 'Bob', 'Carl'].map((n) => pressed(card.getByRole('button', { name: n })))).toEqual([true, true, true])
    expect(screen.queryByText(/Next item/)).not.toBeInTheDocument()
  })

  it('takes someone off the item with one tap', async () => {
    const { user, card } = await renderBill()
    await user.click(card.getByRole('button', { name: 'Bob' }))

    expect(pressed(card.getByRole('button', { name: 'Bob' }))).toBe(false)
    await waitFor(() =>
      expect(writes).toContainEqual({
        table: 'item_shares',
        op: 'delete',
        payload: null,
        filters: [
          ['eq', 'item_id', 'item-1'],
          ['eq', 'member_id', 'm-bob'],
        ],
      })
    )
  })

  it('makes someone the only one splitting it with a double tap', async () => {
    const { user, card } = await renderBill()
    await user.dblClick(card.getByRole('button', { name: 'Carl' }))

    expect(['Alice', 'Bob', 'Carl'].map((n) => pressed(card.getByRole('button', { name: n })))).toEqual([false, false, true])
    await waitFor(() =>
      expect(writes).toContainEqual(
        expect.objectContaining({ table: 'item_shares', op: 'upsert', payload: { item_id: 'item-1', member_id: 'm-carl', shares: 1 } })
      )
    )
  })

  it('warns when no one is left splitting it', async () => {
    db.items[0].item_shares = []
    render(
      <CurrencyProvider>
        <BillView />
      </CurrencyProvider>
    )
    expect(await screen.findByText(/No one's assigned yet/)).toBeInTheDocument()
  })
})

describe('"Add another item"', () => {
  it("starts the next item's default from whoever splits the first", async () => {
    db.items[0].item_shares = shares('m-alice', 'm-carl')
    const { user } = await renderBill()
    await user.click(screen.getByRole('button', { name: /Add another item/ }))

    expect(writes).toContainEqual({
      table: 'bills',
      op: 'update',
      payload: { default_buyer_ids: ['m-alice', 'm-carl'] },
      filters: [['eq', 'id', 'bill-1']],
    })
    const row = within(screen.getByText(/Next item/).closest('.detail-row'))
    expect(['Alice', 'Bob', 'Carl'].map((n) => pressed(row.getByRole('button', { name: n })))).toEqual([true, false, true])
  })

  it("doesn't save anything when the default already matches", async () => {
    const { user } = await renderBill()
    await user.click(screen.getByRole('button', { name: /Add another item/ }))

    expect(screen.getByText(/Next item/)).toBeInTheDocument()
    expect(writes.filter((w) => w.table === 'bills')).toEqual([])
  })

  it("keeps the default when the first item has no one on it", async () => {
    db.items[0].item_shares = []
    db.bill.default_buyer_ids = ['m-bob']
    const { user } = await renderBill()
    await user.click(screen.getByRole('button', { name: /Add another item/ }))

    expect(writes.filter((w) => w.table === 'bills')).toEqual([])
    const row = within(screen.getByText(/Next item/).closest('.detail-row'))
    expect(pressed(row.getByRole('button', { name: 'Bob' }))).toBe(true)
  })
})
