// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseTabularStatement } from './bankStatementTabular'

const { mockDetectColumnsWithAI } = vi.hoisted(() => ({ mockDetectColumnsWithAI: vi.fn() }))
vi.mock('./bankStatementColumns', () => ({ detectColumnsWithAI: mockDetectColumnsWithAI }))

// An Intesa-style export: a block of report details, then the real header.
const ROWS = [
  ['', 'Data inizio periodo:', '01/01/2026'],
  [],
  ['Data', 'Operazione', 'Dettagli', 'Categoria', 'Importo'],
  ['2026-08-26', 'Pagamento Pos', 'PRESSO Bar Centrale Roma', 'Altre uscite', -4.2],
  ['2026-08-25', 'Stipendio', 'Bonifico a Vostro favore', 'Entrate varie', 1500],
]

beforeEach(() => mockDetectColumnsWithAI.mockReset().mockResolvedValue(null))

describe('parseTabularStatement', () => {
  it("reads the details and the bank's category alongside each transaction", async () => {
    const { transactions, warnings } = await parseTabularStatement(ROWS)
    expect(warnings).toEqual([])
    expect(transactions).toEqual([
      {
        date: new Date('2026-08-26').toISOString(),
        description: 'Pagamento Pos',
        details: 'PRESSO Bar Centrale Roma',
        amount: 4.2,
        direction: 'debit',
        categoryHint: 'Altre uscite',
      },
      {
        date: new Date('2026-08-25').toISOString(),
        description: 'Stipendio',
        details: 'Bonifico a Vostro favore',
        amount: 1500,
        direction: 'credit',
        categoryHint: 'Entrate varie',
      },
    ])
  })

  it('keeps both text columns when the AI check picks the other one as the description', async () => {
    mockDetectColumnsWithAI.mockResolvedValue({ dateIdx: 0, descIdx: 2, amountIdx: 4, debitIdx: -1, creditIdx: -1 })
    const { transactions, warnings } = await parseTabularStatement(ROWS)
    expect(transactions[0]).toMatchObject({
      description: 'PRESSO Bar Centrale Roma',
      details: 'Pagamento Pos',
      categoryHint: 'Altre uscite',
    })
    expect(warnings[0]).toMatch(/different column layout/)
  })
})
