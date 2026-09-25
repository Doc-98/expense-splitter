import { describe, it, expect } from 'vitest'
import { createRealtimeRelevance } from './realtimeRelevance'

const insert = (row) => ({ eventType: 'INSERT', new: row, old: {} })
const update = (row) => ({ eventType: 'UPDATE', new: row, old: {} })
const del = (row) => ({ eventType: 'DELETE', new: {}, old: row })

function loaded() {
  const r = createRealtimeRelevance()
  r.learn([
    { id: 'bill-1', items: [{ id: 'item-1' }, { id: 'item-2' }] },
    { id: 'bill-2', items: [] },
  ])
  return r
}

describe('createRealtimeRelevance', () => {
  it('treats everything as relevant until the first load is learned', () => {
    const r = createRealtimeRelevance()
    expect(r.isRelevant('items', insert({ id: 'x', bill_id: 'other-bill' }))).toBe(true)
    expect(r.isRelevant('items', del({ id: 'x' }))).toBe(true)
    expect(r.isRelevant('item_shares', insert({ item_id: 'x', member_id: 'm' }))).toBe(true)
    expect(r.isRelevant('bills', del({ id: 'x' }))).toBe(true)
  })

  it('ignores item and share changes that belong to another group', () => {
    const r = loaded()
    expect(r.isRelevant('items', insert({ id: 'foreign-item', bill_id: 'foreign-bill' }))).toBe(false)
    expect(r.isRelevant('items', update({ id: 'foreign-item', bill_id: 'foreign-bill' }))).toBe(false)
    expect(r.isRelevant('items', del({ id: 'foreign-item' }))).toBe(false)
    expect(r.isRelevant('item_shares', insert({ item_id: 'foreign-item', member_id: 'm' }))).toBe(false)
    expect(r.isRelevant('item_shares', del({ item_id: 'foreign-item', member_id: 'm' }))).toBe(false)
    expect(r.isRelevant('bills', del({ id: 'foreign-bill' }))).toBe(false)
  })

  it("keeps changes to this group's own bills, items and shares", () => {
    const r = loaded()
    expect(r.isRelevant('items', update({ id: 'item-1', bill_id: 'bill-1' }))).toBe(true)
    expect(r.isRelevant('items', del({ id: 'item-2' }))).toBe(true)
    expect(r.isRelevant('item_shares', del({ item_id: 'item-1', member_id: 'm' }))).toBe(true)
    expect(r.isRelevant('bills', del({ id: 'bill-2' }))).toBe(true)
    expect(r.isRelevant('bills', update({ id: 'bill-1' }))).toBe(true)
  })

  it('learns a new item from its own INSERT, so the shares that follow it count', () => {
    const r = loaded()
    expect(r.isRelevant('items', insert({ id: 'item-new', bill_id: 'bill-1' }))).toBe(true)
    expect(r.isRelevant('item_shares', insert({ item_id: 'item-new', member_id: 'm' }))).toBe(true)
  })

  it('learns a new bill from its own INSERT, so its first items count', () => {
    const r = loaded()
    expect(r.isRelevant('bills', insert({ id: 'bill-new' }))).toBe(true)
    expect(r.isRelevant('items', insert({ id: 'item-x', bill_id: 'bill-new' }))).toBe(true)
    expect(r.isRelevant('item_shares', insert({ item_id: 'item-x', member_id: 'm' }))).toBe(true)
  })

  it('still counts a deleted bill after a reload that no longer contains it', () => {
    const r = loaded()
    r.learn([{ id: 'bill-1', items: [] }])
    expect(r.isRelevant('bills', del({ id: 'bill-2' }))).toBe(true)
  })
})
