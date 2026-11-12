import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ImportBankStatement from './ImportBankStatement'
import { CurrencyProvider } from '../context/CurrencyContext'

const { mockFrom, mockFetchAllRows, mockResolveClassifyStrategy, mockClassifyEntries, mockUpdateDraftReview } = vi.hoisted(
  () => ({
    mockFrom: vi.fn(),
    mockFetchAllRows: vi.fn(),
    mockResolveClassifyStrategy: vi.fn(),
    mockClassifyEntries: vi.fn(),
    mockUpdateDraftReview: vi.fn(),
  })
)

// The page's own queries (the group, the account's other groups) go through
// mockFrom; everything it reads through a lib function is mocked at that
// boundary. The statement parsing, the review logic and the classifier's
// entry keys are the real thing — only the AI call itself is faked.
vi.mock('../supabaseClient', () => ({ supabase: { from: mockFrom } }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-me' } }) }))
vi.mock('react-router-dom', () => ({
  useParams: () => ({ groupId: 'group-1' }),
  useNavigate: () => vi.fn(),
  Link: ({ to, children, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('../lib/members', () => ({
  fetchAllGroupMembers: () => Promise.resolve([{ id: 'member-me', userId: 'user-me', name: 'Me' }]),
}))
vi.mock('../lib/categories', () => ({
  fetchCategories: () =>
    Promise.resolve([
      { id: 'cat-groceries', name: 'Groceries' },
      { id: 'cat-eating', name: 'Eating out' },
      { id: 'cat-bills', name: 'Bills' },
    ]),
}))
vi.mock('../lib/fetchAllRows', () => ({ fetchAllRows: mockFetchAllRows }))
vi.mock('../lib/bankImportDrafts', () => ({
  fetchDraft: () => Promise.resolve(null),
  createDraft: () => Promise.resolve('draft-1'),
  updateDraftReview: mockUpdateDraftReview,
  deleteDraft: () => Promise.resolve(),
}))
vi.mock('../lib/billCategorization', async (importOriginal) => ({
  ...(await importOriginal()),
  resolveClassifyStrategy: mockResolveClassifyStrategy,
  classifyEntries: mockClassifyEntries,
}))

// A made-up statement in the shape of a real bank's export: a generic
// title, the merchant only in the details (wrapped in numbers), the bank's
// own category, and one row of money coming in.
const CSV = `Date,Description,Details,Category,Amount
2026-08-26,Pagamento Pos,EFFETTUATO IL 26/08/2026 MEDIANTE LA CARTA 4000 XXXX PRESSO BAR CENTRALE,Hi-tech e informatica,-4.20
2026-08-25,Coop Centro,,Alimentari,-31.00
2026-08-24,Stipendio,Bonifico a Vostro favore,Entrate varie,1500.00`

// Whatever the page builds on a table resolves to `result` when awaited;
// .single() (the group lookup, and each bill/item the review saves)
// resolves to `single`.
function table(result, single = result) {
  const chain = { single: () => Promise.resolve(single) }
  for (const method of ['select', 'eq', 'in', 'insert', 'update', 'delete']) chain[method] = () => chain
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return chain
}

async function pasteStatement() {
  render(
    <CurrencyProvider>
      <ImportBankStatement />
    </CurrencyProvider>
  )
  fireEvent.change(await screen.findByLabelText(/Paste the CSV/), { target: { value: CSV } })
  await userEvent.click(screen.getByRole('button', { name: 'Use this CSV' }))
}

beforeEach(() => {
  localStorage.clear()
  mockFrom.mockReset().mockImplementation((name) =>
    name === 'groups'
      ? table({ data: { is_personal: true }, error: null })
      : table({ data: [], error: null }, { data: { id: `${name}-1` }, error: null })
  )
  mockFetchAllRows.mockReset().mockResolvedValue([])
  mockResolveClassifyStrategy.mockReset().mockReturnValue(null)
  mockClassifyEntries.mockReset()
  mockUpdateDraftReview.mockReset().mockResolvedValue()
})

describe('ImportBankStatement', () => {
  it("shows the statement's details and the bank's category on the card", async () => {
    localStorage.setItem(
      'spesa-bank-category-mappings',
      JSON.stringify({ 'group-1': { 'hi-tech e informatica': null, alimentari: 'cat-groceries' } })
    )
    await pasteStatement()

    expect(await screen.findByText('Pagamento Pos')).toBeInTheDocument()
    expect(screen.getByText(/PRESSO BAR CENTRALE/)).toBeInTheDocument()
    expect(screen.getByText('Category in the file: Hi-tech e informatica')).toBeInTheDocument()
    expect(screen.getByText('Transaction 1 of 2 (0 reviewed)')).toBeInTheDocument()
  })

  describe('with no AI set up', () => {
    it("asks what the bank's categories mean, only for the ones on spending, and marks the result as the bank's", async () => {
      await pasteStatement()

      expect(await screen.findByText('Hi-tech e informatica')).toBeInTheDocument()
      expect(screen.getByText('Alimentari')).toBeInTheDocument()
      expect(screen.queryByText('Entrate varie')).not.toBeInTheDocument()

      const [, groceriesPicker] = screen.getAllByRole('combobox')
      await userEvent.selectOptions(groceriesPicker, 'cat-groceries')
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
      await userEvent.click(await screen.findByRole('button', { name: 'Next' }))

      expect(await screen.findByText('Coop Centro')).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('cat-groceries')
      expect(screen.getByText(/Taken from the category in the file/)).toBeInTheDocument()

      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'cat-eating')
      expect(screen.queryByText(/Taken from the category in the file/)).not.toBeInTheDocument()
    })
  })

  describe('with an AI set up', () => {
    beforeEach(() => mockResolveClassifyStrategy.mockReturnValue({ id: 'claude', label: 'Claude' }))

    it("skips the matching step and gives the AI the details without their numbers and the bank's category", async () => {
      localStorage.setItem(
        'spesa-bank-category-mappings',
        JSON.stringify({ 'group-1': { 'hi-tech e informatica': 'cat-bills' } })
      )
      mockClassifyEntries.mockReturnValue(new Promise(() => {})) // still thinking
      await pasteStatement()

      // Straight to the review, nothing to match first; the bank's own
      // category fills in until the AI answers.
      expect(await screen.findByText('Pagamento Pos')).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('cat-bills')
      expect(screen.getByText(/Taken from the category in the file/)).toBeInTheDocument()

      const [entries, categoryNames] = mockClassifyEntries.mock.calls[0]
      expect(categoryNames).toEqual(['Groceries', 'Eating out', 'Bills'])
      expect(entries).toEqual([
        {
          title: 'Pagamento Pos',
          details: 'EFFETTUATO IL MEDIANTE LA CARTA PRESSO BAR CENTRALE',
          bankCategory: 'Hi-tech e informatica',
          bankCategoryMappedTo: 'Bills',
        },
        { title: 'Coop Centro', details: null, bankCategory: 'Alimentari', bankCategoryMappedTo: null },
      ])

    })

    it("replaces the bank's category with the AI's answer and says where it came from", async () => {
      localStorage.setItem(
        'spesa-bank-category-mappings',
        JSON.stringify({ 'group-1': { 'hi-tech e informatica': 'cat-bills', alimentari: 'cat-bills' } })
      )
      const { classifyEntryKey } = await vi.importActual('../lib/billCategorization')
      mockClassifyEntries.mockImplementation((entries) =>
        Promise.resolve(
          new Map([
            [classifyEntryKey(entries[0]), 'Eating out'],
            [classifyEntryKey(entries[1]), null],
          ])
        )
      )
      await pasteStatement()

      expect(await screen.findByText(/Suggested by AI/)).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('cat-eating')
      await waitFor(() => expect(mockUpdateDraftReview).toHaveBeenCalled())

      // The AI saw the bank's category for the second one and still
      // couldn't tell: the bank's guess is dropped, not kept.
      await userEvent.click(screen.getByRole('button', { name: 'Next' }))
      expect(await screen.findByText('Coop Centro')).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('')
      expect(screen.getByText(/AI couldn’t tell/)).toBeInTheDocument()
    })

    it('uses the category a merchant was always filed under before, without asking the AI about it', async () => {
      mockFetchAllRows.mockResolvedValue([
        { title: 'Coop Centro', created_at: '2026-06-02', category_id: 'cat-groceries', items: [{ total_price: 12 }] },
        { title: 'COOP CENTRO', created_at: '2026-07-04', category_id: 'cat-groceries', items: [{ total_price: 20 }] },
      ])
      mockClassifyEntries.mockResolvedValue(new Map())
      await pasteStatement()

      expect(await screen.findByText('Pagamento Pos')).toBeInTheDocument()
      expect(mockClassifyEntries.mock.calls[0][0].map((entry) => entry.title)).toEqual(['Pagamento Pos'])

      await userEvent.click(screen.getByRole('button', { name: 'Next' }))
      expect(await screen.findByText('Coop Centro')).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('cat-groceries')
      expect(screen.getByText('Same category as your earlier bills from here.')).toBeInTheDocument()
    })
  })
})
