import { describe, it, expect } from 'vitest'
import { parseCsv, toCsv, buildBillCsvRows, buildGroupCsvRows } from './csv'

describe('parseCsv', () => {
  it('parses a simple comma-separated grid', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('handles a quoted field containing a comma', () => {
    expect(parseCsv('name,note\n"Smith, John",hello')).toEqual([
      ['name', 'note'],
      ['Smith, John', 'hello'],
    ])
  })

  it('unescapes a doubled quote inside a quoted field', () => {
    expect(parseCsv('note\n"She said ""hi"""')).toEqual([['note'], ['She said "hi"']])
  })

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('handles a file with no trailing newline', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('drops a genuinely empty trailing line rather than an empty row', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('toCsv', () => {
  it('joins header and rows with CRLF', () => {
    expect(toCsv(['a', 'b'], [['1', '2']])).toBe('a,b\r\n1,2')
  })

  it('quotes a field only when it needs it', () => {
    expect(toCsv(['plain', 'with,comma', 'with"quote'], [])).toBe('plain,"with,comma","with""quote"')
  })

  it('round-trips through parseCsv', () => {
    const header = ['Item', 'Note']
    const rows = [['Milk, 2%', 'Say "please"']]
    const csv = toCsv(header, rows)
    expect(parseCsv(csv.replace(/\r\n/g, '\n'))).toEqual([header, ...rows])
  })
})

describe('buildBillCsvRows', () => {
  const members = [
    { id: 'm1', name: 'Alice' },
    { id: 'm2', name: 'Bob' },
  ]

  it('builds one row per item, formatting money to two decimals', () => {
    const items = [
      {
        name: 'Pizza',
        quantity: 2,
        unit_price: 8,
        total_price: 16,
        item_shares: [{ member_id: 'm1' }, { member_id: 'm2' }],
      },
    ]
    const { header, rows } = buildBillCsvRows(items, members)
    expect(header).toEqual(['Item', 'Quantity', 'Unit Price', 'Total Price', 'Split With'])
    expect(rows).toEqual([['Pizza', 2, '8.00', '16.00', 'Alice; Bob']])
  })

  it('falls back to "Someone" for a share whose member is gone', () => {
    const items = [
      { name: 'Soda', quantity: 1, unit_price: 2, total_price: 2, item_shares: [{ member_id: 'ghost' }] },
    ]
    const { rows } = buildBillCsvRows(items, members)
    expect(rows[0][4]).toBe('Someone')
  })

  it('handles an item with no shares at all', () => {
    const items = [{ name: 'Napkins', quantity: 1, unit_price: 0, total_price: 0 }]
    const { rows } = buildBillCsvRows(items, members)
    expect(rows[0][4]).toBe('')
  })
})

describe('buildGroupCsvRows', () => {
  const members = [{ id: 'm1', name: 'Alice' }]
  const categories = [{ id: 'c1', name: 'Groceries' }]

  it('resolves category by item first, then bill, then Uncategorized', () => {
    const bills = [
      {
        title: 'Trip',
        created_at: '2026-03-05T12:00:00Z',
        paid_by: 'm1',
        category_id: 'c1',
        items: [
          { name: 'Own category', quantity: 1, unit_price: 1, total_price: 1, category_id: 'c1' },
          { name: 'Falls back to bill', quantity: 1, unit_price: 1, total_price: 1, category_id: null },
        ],
      },
      {
        title: 'No category anywhere',
        created_at: '2026-03-06T12:00:00Z',
        paid_by: 'm1',
        category_id: null,
        items: [{ name: 'Mystery item', quantity: 1, unit_price: 1, total_price: 1, category_id: null }],
      },
    ]
    const { rows } = buildGroupCsvRows(bills, members, categories)
    expect(rows[0][6]).toBe('Groceries')
    expect(rows[1][6]).toBe('Groceries')
    expect(rows[2][6]).toBe('Uncategorized')
  })

  it('formats multi-payer bills as "Name (amount); Name (amount)"', () => {
    const bills = [
      {
        title: 'Split bill',
        created_at: '2026-03-05T12:00:00Z',
        payers: [{ member_id: 'm1', amount: 12.5 }],
        items: [{ name: 'Item', quantity: 1, unit_price: 12.5, total_price: 12.5 }],
      },
    ]
    const { rows } = buildGroupCsvRows(bills, members, categories)
    expect(rows[0][7]).toBe('Alice (12.50)')
  })

  it('contributes zero rows for a bill with no items', () => {
    const bills = [{ title: 'Empty draft', created_at: '2026-03-05T12:00:00Z', paid_by: 'm1', items: [] }]
    const { rows } = buildGroupCsvRows(bills, members, categories)
    expect(rows).toEqual([])
  })
})
