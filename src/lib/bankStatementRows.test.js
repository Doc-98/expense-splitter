// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  cellToString,
  parseMoneyAmount,
  detectColumns,
  isUsableColumnMapping,
  findHeaderRowIndex,
  buildTransactionsFromColumns,
  buildTransactionsFromRows,
} from './bankStatementRows'

describe('cellToString', () => {
  it('passes a plain string through trimmed', () => {
    expect(cellToString('  hello  ')).toBe('hello')
  })
  it('formats a Date cell as ISO', () => {
    const d = new Date('2026-03-05T00:00:00Z')
    expect(cellToString(d)).toBe(d.toISOString())
  })
  it('returns empty string for null/undefined', () => {
    expect(cellToString(null)).toBe('')
    expect(cellToString(undefined)).toBe('')
  })
})

describe('parseMoneyAmount', () => {
  it('parses a plain number cell as-is', () => {
    expect(parseMoneyAmount(42.5)).toBe(42.5)
  })
  it('parses US-style thousands/decimal ("1,234.56")', () => {
    expect(parseMoneyAmount('1,234.56')).toBe(1234.56)
  })
  it('parses EU-style thousands/decimal ("1.234,56")', () => {
    expect(parseMoneyAmount('1.234,56')).toBe(1234.56)
  })
  it('strips a currency symbol', () => {
    expect(parseMoneyAmount('$42.10')).toBe(42.1)
    expect(parseMoneyAmount('€ 1.234,56')).toBe(1234.56)
  })
  it('treats a lone comma as a decimal point', () => {
    expect(parseMoneyAmount('42,10')).toBe(42.1)
  })
  it('reads parenthesized amounts as negative (accounting notation)', () => {
    expect(parseMoneyAmount('(42.10)')).toBe(-42.1)
  })
  it('keeps an explicit minus sign negative', () => {
    expect(parseMoneyAmount('-42.10')).toBe(-42.1)
  })
  it('returns NaN for unparseable input', () => {
    expect(parseMoneyAmount('not money')).toBeNaN()
    expect(parseMoneyAmount(null)).toBeNaN()
  })
})

describe('detectColumns', () => {
  it('matches a plain English header', () => {
    const columns = detectColumns(['Date', 'Description', 'Amount'])
    expect(columns).toMatchObject({ dateIdx: 0, descIdx: 1, amountIdx: 2, debitIdx: -1, creditIdx: -1 })
  })

  it('matches an Italian header', () => {
    const columns = detectColumns(['Data operazione', 'Descrizione', 'Importo'])
    expect(columns).toMatchObject({ dateIdx: 0, descIdx: 1, amountIdx: 2 })
  })

  it('matches separate debit/credit columns instead of one amount column', () => {
    const columns = detectColumns(['Date', 'Payee', 'Debit', 'Credit'])
    expect(columns).toMatchObject({ dateIdx: 0, descIdx: 1, amountIdx: -1, debitIdx: 2, creditIdx: 3 })
  })

  it('matches a Category/Categoria column when present', () => {
    expect(detectColumns(['Date', 'Description', 'Amount', 'Category']).categoryIdx).toBe(3)
    expect(detectColumns(['Data', 'Descrizione', 'Importo', 'Categoria']).categoryIdx).toBe(3)
  })

  it('finds a second, longer text column next to the description', () => {
    // An Intesa-style export: a short "Operazione" and the full "Dettagli".
    const cols = detectColumns(['Data', 'Operazione', 'Dettagli', 'Conto o carta', 'Categoria', 'Valuta', 'Importo'])
    expect(cols).toMatchObject({ dateIdx: 0, descIdx: 1, detailsIdx: 2, categoryIdx: 4, amountIdx: 6 })
    expect(detectColumns(['Date', 'Description', 'Notes', 'Amount'])).toMatchObject({ descIdx: 1, detailsIdx: 2 })
  })

  it('keeps a lone text column as the description, with no details', () => {
    expect(detectColumns(['Date', 'Details', 'Amount'])).toMatchObject({ descIdx: 1, detailsIdx: -1 })
    expect(detectColumns(['Data', 'Causale', 'Importo'])).toMatchObject({ descIdx: 1, detailsIdx: -1 })
  })

  it('reports categoryIdx as -1 when no category column exists', () => {
    expect(detectColumns(['Date', 'Description', 'Amount']).categoryIdx).toBe(-1)
  })

  it('is case-insensitive', () => {
    expect(detectColumns(['DATE', 'description', 'AMOUNT'])).toMatchObject({ dateIdx: 0, descIdx: 1, amountIdx: 2 })
  })
})

describe('isUsableColumnMapping', () => {
  it('requires date + description + (amount or debit/credit)', () => {
    expect(isUsableColumnMapping({ dateIdx: 0, descIdx: 1, amountIdx: 2, debitIdx: -1, creditIdx: -1 })).toBe(true)
    expect(isUsableColumnMapping({ dateIdx: 0, descIdx: 1, amountIdx: -1, debitIdx: 2, creditIdx: -1 })).toBe(true)
    expect(isUsableColumnMapping({ dateIdx: 0, descIdx: 1, amountIdx: -1, debitIdx: -1, creditIdx: -1 })).toBe(false)
    expect(isUsableColumnMapping({ dateIdx: -1, descIdx: 1, amountIdx: 2, debitIdx: -1, creditIdx: -1 })).toBe(false)
  })
  it('rejects null/undefined', () => {
    expect(isUsableColumnMapping(null)).toBe(false)
  })
})

describe('findHeaderRowIndex', () => {
  it('finds the header row after a block of report-metadata preamble', () => {
    const rows = [
      ['Account summary'],
      ['Statement period: Jan-Mar 2026'],
      ['Date', 'Description', 'Amount'],
      ['2026-03-05', 'Coffee', '-4.50'],
    ]
    expect(findHeaderRowIndex(rows)).toBe(2)
  })

  it('returns -1 when nothing in range looks like a header', () => {
    const rows = [['x'], ['y'], ['z']]
    expect(findHeaderRowIndex(rows)).toBe(-1)
  })

  it('returns 0 when the header genuinely is the first row', () => {
    const rows = [['Date', 'Description', 'Amount'], ['2026-03-05', 'Coffee', '-4.50']]
    expect(findHeaderRowIndex(rows)).toBe(0)
  })
})

describe('buildTransactionsFromColumns', () => {
  const columns = { dateIdx: 0, descIdx: 1, amountIdx: 2, debitIdx: -1, creditIdx: -1, categoryIdx: -1 }

  it('splits a signed amount into a positive amount + direction', () => {
    const { transactions } = buildTransactionsFromColumns(
      [
        ['2026-03-05', 'Coffee', '-4.50'],
        ['2026-03-06', 'Salary', '2000'],
      ],
      columns
    )
    expect(transactions).toEqual([
      { date: new Date('2026-03-05').toISOString(), description: 'Coffee', details: null, amount: 4.5, direction: 'debit', categoryHint: null },
      { date: new Date('2026-03-06').toISOString(), description: 'Salary', details: null, amount: 2000, direction: 'credit', categoryHint: null },
    ])
  })

  it('reads separate debit/credit columns as magnitudes regardless of any sign written in the cell', () => {
    const debitCreditColumns = { dateIdx: 0, descIdx: 1, amountIdx: -1, debitIdx: 2, creditIdx: 3, categoryIdx: -1 }
    const { transactions } = buildTransactionsFromColumns(
      [['2026-03-05', 'Coffee', '4.50', ''], ['2026-03-06', 'Refund', '', '10.00']],
      debitCreditColumns
    )
    expect(transactions[0]).toMatchObject({ amount: 4.5, direction: 'debit' })
    expect(transactions[1]).toMatchObject({ amount: 10, direction: 'credit' })
  })

  it('sets categoryHint from a Category column when present', () => {
    const withCategory = { ...columns, categoryIdx: 3 }
    const { transactions } = buildTransactionsFromColumns([['2026-03-05', 'Coffee', '-4.50', 'Eating out']], withCategory)
    expect(transactions[0].categoryHint).toBe('Eating out')
  })

  it('sets categoryHint to null for a blank category cell', () => {
    const withCategory = { ...columns, categoryIdx: 3 }
    const { transactions } = buildTransactionsFromColumns([['2026-03-05', 'Coffee', '-4.50', '']], withCategory)
    expect(transactions[0].categoryHint).toBeNull()
  })

  describe('with a details column', () => {
    const withDetails = { ...columns, detailsIdx: 3 }

    it('keeps the longer text as details, on one line', () => {
      const { transactions } = buildTransactionsFromColumns(
        [['2026-03-05', 'Pagamento Pos', '-4.20', 'PRESSO  Bar Centrale\nRoma']],
        withDetails
      )
      expect(transactions[0]).toMatchObject({ description: 'Pagamento Pos', details: 'PRESSO Bar Centrale Roma' })
    })

    it('has no details when the cell is blank or only repeats the description', () => {
      const { transactions } = buildTransactionsFromColumns(
        [
          ['2026-03-05', 'Coffee', '-4.50', ''],
          ['2026-03-06', 'Coffee', '-4.50', 'COFFEE'],
        ],
        withDetails
      )
      expect(transactions.map((t) => t.details)).toEqual([null, null])
    })

    it('uses the details as the description when that one is blank', () => {
      const { transactions } = buildTransactionsFromColumns([['2026-03-05', '', '-4.50', 'Bar Centrale']], withDetails)
      expect(transactions[0]).toMatchObject({ description: 'Bar Centrale', details: null })
    })
  })

  it('skips a row with no description entirely (not even a warning)', () => {
    const { transactions } = buildTransactionsFromColumns([['2026-03-05', '', '-4.50']], columns)
    expect(transactions).toEqual([])
  })

  it('skips a row with an unparseable date, with a warning', () => {
    const { transactions, warnings } = buildTransactionsFromColumns([['not a date', 'Coffee', '-4.50']], columns)
    expect(transactions).toEqual([])
    expect(warnings[0]).toMatch(/valid date/)
  })

  it('skips a row with an unparseable or zero amount, with a warning', () => {
    const { transactions, warnings } = buildTransactionsFromColumns([['2026-03-05', 'Coffee', '0']], columns)
    expect(transactions).toEqual([])
    expect(warnings[0]).toMatch(/valid amount/)
  })
})

describe('buildTransactionsFromRows (heuristic-only, no AI)', () => {
  it('parses a well-formed CSV-shaped grid end to end', () => {
    const rows = [
      ['Date', 'Description', 'Amount'],
      ['2026-03-05', 'Coffee', '-4.50'],
      ['2026-03-06', 'Salary', '2000.00'],
    ]
    const { transactions, warnings } = buildTransactionsFromRows(rows)
    expect(warnings).toEqual([])
    expect(transactions).toHaveLength(2)
    expect(transactions[0].direction).toBe('debit')
    expect(transactions[1].direction).toBe('credit')
  })

  it('reports a helpful error for a file with no recognizable header', () => {
    const rows = [['x', 'y', 'z'], ['1', '2', '3']]
    const { transactions, warnings } = buildTransactionsFromRows(rows)
    expect(transactions).toEqual([])
    expect(warnings[0]).toMatch(/doesn't look like a bank statement/)
  })

  it('reports "looks empty" for a file with fewer than 2 rows', () => {
    expect(buildTransactionsFromRows([]).warnings[0]).toMatch(/looks empty/)
    expect(buildTransactionsFromRows([['Date', 'Description', 'Amount']]).warnings[0]).toMatch(/looks empty/)
  })
})
