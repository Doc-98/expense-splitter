// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { detailsForClassifier, buildCategoryMemory, categoryFromMemory, classifierEntry } from './bankStatementEvidence'

describe('detailsForClassifier', () => {
  it('keeps the words and drops every number: cards, IBANs, codes, dates and times', () => {
    expect(
      detailsForClassifier(
        'EFFETTUATO IL 25/08/2026 ALLE ORE 0930 MEDIANTE LA CARTA 4000 XXXX XXXX XX12 PRESSO ILIAD ITALIA Roma',
        'ILIAD ITALIA Roma'
      )
    ).toBe('EFFETTUATO IL ALLE ORE MEDIANTE LA CARTA PRESSO ILIAD ITALIA Roma')
    expect(
      detailsForClassifier(
        'Verso MARIO ROSSI data 20.08 IBAN Benef. IT60X0542811101000000123456 identific.univoco transazione P2P2608P123',
        'Trasferimento Denaro BANCOMAT Pay'
      )
    ).toBe('Verso MARIO ROSSI data IBAN Benef. identific.univoco transazione')
    expect(detailsForClassifier('Pagamento su POS BAR CENTRALE 04/081530 Carta n.4000 XXXX XXXX XX12 COD. 1234567/00012')).toBe(
      'Pagamento su POS BAR CENTRALE Carta COD.'
    )
  })

  it('is null when there is nothing, nothing but numbers, or only the title again', () => {
    expect(detailsForClassifier(null)).toBe(null)
    expect(detailsForClassifier('   ')).toBe(null)
    expect(detailsForClassifier('0012345 / 26.08.2026 XXXX 12:14')).toBe(null)
    expect(detailsForClassifier('BAR CENTRALE', 'Bar Centrale')).toBe(null)
  })

  it('cuts a very long text short', () => {
    const cleaned = detailsForClassifier('parola '.repeat(80))
    expect(cleaned.length).toBeLessThanOrEqual(201)
    expect(cleaned.endsWith('…')).toBe(true)
  })
})

describe('buildCategoryMemory', () => {
  const past = [
    { description: 'Coop S012 Bo Centro', categoryId: 'groceries' },
    { description: 'COOP S012 BO CENTRO 12/03', categoryId: 'groceries' },
    { description: 'Pizzeria Da Gino', categoryId: 'eating-out' },
    { description: 'Addebito diretto disposto a favore di PayPal', categoryId: 'other' },
    { description: 'Addebito diretto disposto a favore di PayPal', categoryId: 'household' },
    { description: 'Trenitalia Roma', categoryId: null },
    { description: 'Trenitalia Roma', categoryId: null },
  ]
  const memory = buildCategoryMemory(past)

  it('remembers the category a merchant was filed under every time', () => {
    expect(categoryFromMemory({ description: 'Coop S012 Bo Centro 26/08' }, memory)).toBe('groceries')
  })

  it('remembers nothing after a single bill: one choice is not a habit yet', () => {
    expect(categoryFromMemory({ description: 'PIZZERIA DA GINO' }, memory)).toBe(null)
  })

  it('remembers nothing for a description filed under different categories, or never categorized', () => {
    expect(categoryFromMemory({ description: 'Addebito diretto disposto a favore di PayPal' }, memory)).toBe(null)
    expect(categoryFromMemory({ description: 'Trenitalia Roma' }, memory)).toBe(null)
    expect(categoryFromMemory({ description: 'Somewhere new' }, memory)).toBe(null)
  })
})

describe('classifierEntry', () => {
  it("carries the title, the cleaned details and the bank's category", () => {
    const tx = {
      description: 'Pagamento Pos',
      details: 'PRESSO Bar Centrale 26/08 Carta n.4000',
      categoryHint: 'Ristoranti e bar',
    }
    expect(classifierEntry(tx, 'Eating out')).toEqual({
      title: 'Pagamento Pos',
      details: 'PRESSO Bar Centrale Carta',
      bankCategory: 'Ristoranti e bar',
      bankCategoryMappedTo: 'Eating out',
    })
    expect(classifierEntry({ description: 'Coop' })).toEqual({
      title: 'Coop',
      details: null,
      bankCategory: null,
      bankCategoryMappedTo: null,
    })
  })
})
