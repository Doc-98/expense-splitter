// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { budgetRows, budgetTrackRecord, describeTrackRecord, makeSpendForRange } from './budgets'
import { budgetComparisonRange } from './budgetPeriod'

const ME = 'member-me'
const FRIEND = 'member-friend'
const categoryNameById = new Map([
  ['cat-food', 'Groceries'],
  ['cat-fun', 'Going out'],
])

// One bill per entry, with one item split between the given people.
function dataset(entries) {
  const bills = []
  const items = []
  const itemShares = []
  entries.forEach(([date, price, categoryId, sharers], i) => {
    bills.push({ id: `b${i}`, created_at: new Date(`${date}T12:00:00`).toISOString(), category_id: categoryId })
    items.push({ id: `i${i}`, bill_id: `b${i}`, total_price: price, category_id: null })
    for (const who of sharers) itemShares.push({ item_id: `i${i}`, user_id: who, shares: 1 })
  })
  return { bills, items, itemShares }
}

const thresholds = [
  { category_name: 'Groceries', amount: 200 },
  { category_name: ' going out ', amount: 80 },
]

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 15, 12)) // Thursday 15 October 2026
})
afterEach(() => vi.useRealTimers())

describe('makeSpendForRange', () => {
  it('counts only your own share, only inside the range, plus departed groups', () => {
    const spendForRange = makeSpendForRange({
      ...dataset([
        ['2026-10-02', 100, 'cat-food', [ME, FRIEND]], // my half: 50
        ['2026-10-10', 30, 'cat-food', [ME]], // 30
        ['2026-10-11', 40, 'cat-food', [FRIEND]], // not mine
        ['2026-09-30', 500, 'cat-food', [ME]], // last month
      ]),
      myParticipantIds: new Set([ME]),
      categoryNameById,
      snapshots: [{ daily_totals: { '2026-10-05': { paid: 9, consumed: 9, categories: { Groceries: 9 } } } }],
    })
    expect(spendForRange(budgetComparisonRange('month')).groceries.amount).toBe(89)
    expect(spendForRange(budgetComparisonRange('month', -1)).groceries.amount).toBe(500)
  })
})

describe('budgetRows', () => {
  it('compares spend with each cap, in the period chosen, sorted by name', () => {
    const rows = budgetRows(thresholds, { groceries: { amount: 210 }, 'going out': { amount: 15 } }, 'month')
    expect(rows).toEqual([
      { key: 'going out', name: ' going out ', spent: 15, amount: 80, over: false },
      { key: 'groceries', name: 'Groceries', spent: 210, amount: 200, over: true },
    ])
  })

  it('shows a weekly cap as a quarter of the stored monthly one', () => {
    const [groceries] = budgetRows([thresholds[0]], { groceries: { amount: 50 } }, 'week')
    expect(groceries).toMatchObject({ amount: 50, over: false })
  })

  it('counts a category with no spending as zero', () => {
    expect(budgetRows([thresholds[0]], {}, 'month')[0]).toMatchObject({ spent: 0, over: false })
  })
})

describe('budgetTrackRecord', () => {
  const spendForRange = makeSpendForRange({
    ...dataset([
      ['2026-10-03', 999, 'cat-food', [ME]], // this month: not part of the record
      ['2026-09-12', 250, 'cat-food', [ME]], // over
      ['2026-08-20', 150, 'cat-food', [ME]], // within
      ['2026-07-04', 120, 'cat-food', [ME]],
      ['2026-07-25', 120, 'cat-food', [ME]], // 240 in July: over
      ['2026-03-10', 900, 'cat-food', [ME]], // seven months ago: outside the record
      ['2026-06-01', 81, 'cat-fun', [ME]], // over the 80 cap
    ]),
    myParticipantIds: new Set([ME]),
    categoryNameById,
  })

  it('counts the past six months each budget went over, not this one', () => {
    expect(budgetTrackRecord(thresholds, spendForRange, 'month')).toEqual({ groceries: 2, 'going out': 1 })
  })

  it('works in weeks too', () => {
    // Weekly caps: groceries 50, going out 20. The past six weeks run from
    // Mon 31 Aug to Sun 11 Oct: the 12 Sep and 3 Oct bills are each over.
    expect(budgetTrackRecord(thresholds, spendForRange, 'week')).toEqual({ groceries: 2, 'going out': 0 })
  })
})

describe('describeTrackRecord', () => {
  it('says how often a budget went over', () => {
    expect(describeTrackRecord(2, 'month')).toBe('Over in 2 of the last 6 months')
    expect(describeTrackRecord(0, 'week')).toBe('Within budget all 6 weeks')
  })
})
