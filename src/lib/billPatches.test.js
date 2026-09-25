import { describe, it, expect } from 'vitest'
import { applyBillPatch, compareBills, diffBillLists, emptyPending, planSync, queueAffected } from './billPatches'
import { createRealtimeRelevance, ALL_BILLS } from './realtimeRelevance'

describe('queueAffected', () => {
  it('queues bill ids, a full reload, or nothing', () => {
    const pending = emptyPending()
    expect(queueAffected(pending, null)).toBe(false)
    expect(queueAffected(pending, ['b1'])).toBe(true)
    expect(queueAffected(pending, ['b2'])).toBe(true)
    expect([...pending.billIds]).toEqual(['b1', 'b2'])
    expect(pending.full).toBe(false)
    expect(queueAffected(pending, ALL_BILLS)).toBe(true)
    expect(pending.full).toBe(true)
  })
})

describe('planSync', () => {
  const withIds = (...ids) => ({ ...emptyPending(), billIds: new Set(ids) })

  it('patches queued bills once the complete list is loaded', () => {
    expect(planSync(withIds('b1', 'b2'), { fullyLoaded: true })).toEqual({ kind: 'patch', billIds: ['b1', 'b2'] })
  })

  it('does a full reload instead when there is no complete list yet (cache or first-paint window)', () => {
    expect(planSync(withIds('b1'), { fullyLoaded: false })).toEqual({ kind: 'full' })
  })

  it('does a full reload when patching is switched off', () => {
    expect(planSync(withIds('b1'), { fullyLoaded: true, enabled: false })).toEqual({ kind: 'full' })
  })

  it('does a full reload for too many bills at once', () => {
    expect(planSync(withIds('a', 'b', 'c'), { fullyLoaded: true, maxBills: 2 })).toEqual({ kind: 'full' })
  })

  it('lets a queued full reload win over patches and verification', () => {
    expect(planSync({ full: true, billIds: new Set(['b1']), verify: true }, { fullyLoaded: true })).toEqual({ kind: 'full' })
  })

  it('verifies only when nothing else is queued', () => {
    expect(planSync({ ...emptyPending(), verify: true }, { fullyLoaded: true })).toEqual({ kind: 'verify' })
    expect(planSync({ ...withIds('b1'), verify: true }, { fullyLoaded: true }).kind).toBe('patch')
  })

  it('does nothing when nothing is queued', () => {
    expect(planSync(emptyPending(), { fullyLoaded: true })).toEqual({ kind: 'none' })
  })
})

const bill = (id, created_at, extra = {}) => ({ id, created_at, items: [], bill_payers: [], ...extra })

describe('compareBills', () => {
  it('sorts newest first', () => {
    const list = [bill('a', '2026-01-01T00:00:00+00:00'), bill('b', '2026-03-01T00:00:00+00:00')].sort(compareBills)
    expect(list.map((b) => b.id)).toEqual(['b', 'a'])
  })

  it('tells apart bills a few microseconds apart, like Postgres does', () => {
    const list = [
      bill('a', '2026-01-01T10:00:00.000001+00:00'),
      bill('b', '2026-01-01T10:00:00.000003+00:00'),
      bill('c', '2026-01-01T10:00:00+00:00'),
    ].sort(compareBills)
    expect(list.map((b) => b.id)).toEqual(['b', 'a', 'c'])
  })

  it('breaks exact ties by id, descending', () => {
    const t = '2026-07-09T00:00:00+00:00'
    const list = [bill('1111', t), bill('ffff', t), bill('8888', t)].sort(compareBills)
    expect(list.map((b) => b.id)).toEqual(['ffff', '8888', '1111'])
  })
})

describe('applyBillPatch', () => {
  const base = [bill('c', '2026-03-01T00:00:00+00:00'), bill('b', '2026-02-01T00:00:00+00:00'), bill('a', '2026-01-01T00:00:00+00:00')]

  it('replaces a changed bill in place', () => {
    const next = applyBillPatch(base, ['b'], [bill('b', '2026-02-01T00:00:00+00:00', { title: 'renamed' })])
    expect(next.map((b) => b.id)).toEqual(['c', 'b', 'a'])
    expect(next[1].title).toBe('renamed')
  })

  it('inserts a new bill at its date position', () => {
    const next = applyBillPatch(base, ['n'], [bill('n', '2026-02-15T00:00:00+00:00')])
    expect(next.map((b) => b.id)).toEqual(['c', 'n', 'b', 'a'])
  })

  it('moves a bill whose date was edited', () => {
    const next = applyBillPatch(base, ['a'], [bill('a', '2026-04-01T00:00:00+00:00')])
    expect(next.map((b) => b.id)).toEqual(['a', 'c', 'b'])
  })

  it('removes a bill that was asked for but not returned (deleted)', () => {
    expect(applyBillPatch(base, ['b'], []).map((b) => b.id)).toEqual(['c', 'a'])
  })

  it('ignores returned bills that were not asked for', () => {
    const next = applyBillPatch(base, ['b'], [bill('b', '2026-02-01T00:00:00+00:00'), bill('x', '2026-05-01T00:00:00+00:00')])
    expect(next.map((b) => b.id)).toEqual(['c', 'b', 'a'])
  })

  it('never mutates its inputs', () => {
    const copy = JSON.parse(JSON.stringify(base))
    applyBillPatch(base, ['b', 'n'], [bill('n', '2026-02-15T00:00:00+00:00')])
    expect(base).toEqual(copy)
  })
})

describe('diffBillLists', () => {
  it('treats nested arrays in a different order as equal', () => {
    const one = bill('a', '2026-01-01T00:00:00+00:00', {
      items: [
        { id: 'i2', total_price: 1, item_shares: [{ member_id: 'm2', shares: 1 }, { member_id: 'm1', shares: 1 }] },
        { id: 'i1', total_price: 2, item_shares: [] },
      ],
    })
    const two = bill('a', '2026-01-01T00:00:00+00:00', {
      items: [
        { item_shares: [], total_price: 2, id: 'i1' },
        { id: 'i2', total_price: 1, item_shares: [{ member_id: 'm1', shares: 1 }, { member_id: 'm2', shares: 1 }] },
      ],
    })
    expect(diffBillLists([one], [two])).toEqual([])
  })

  it('reports changed, missing and misplaced bills', () => {
    const a = bill('a', '2026-01-01T00:00:00+00:00')
    const b = bill('b', '2026-02-01T00:00:00+00:00')
    expect(diffBillLists([b, a], [b, { ...a, title: 'x' }])).toEqual(['a'])
    expect(diffBillLists([b, a], [b])).toEqual(['a'])
    expect(diffBillLists([b, a], [a, b]).sort()).toEqual(['a', 'b'])
  })
})

// A fake server holding two groups' bills, mutated at random. Every change
// emits the realtime events Supabase would deliver to a page watching
// group G (bills INSERT/UPDATE filtered to G; deletes and items/shares
// unfiltered, deletes carrying only the primary key). After each batch the
// page applies patches the way GroupView does — and must end up identical
// to a fresh full reload.
describe('patches always equal a full reload (randomized)', () => {
  function rng(seed) {
    let s = seed >>> 0
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0
      return s / 2 ** 32
    }
  }

  function simulate(seed, steps) {
    const rand = rng(seed)
    const pick = (list) => list[Math.floor(rand() * list.length)]
    const hex = () => Math.floor(rand() * 0xffffffff).toString(16).padStart(8, '0')
    const newId = () => `${hex()}-0000-4000-8000-${hex()}0000`
    const stamp = () => {
      // Deliberately collision-prone: few days, and fractions chosen so exact
      // ties, same-millisecond-different-microsecond pairs, and plain
      // ordering all come up often (imported bills really do share stamps).
      const day = String(1 + Math.floor(rand() * 3)).padStart(2, '0')
      const fraction = pick(['', '', '.000001', '.000002', '.5', '.500001', '.500002', '.123456'])
      return `2026-09-${day}T12:00:00${fraction}+00:00`
    }

    // The fake server's own ordering, computed independently of
    // compareBills (exact integer microseconds, then id desc) — otherwise a
    // bug in compareBills would break the "server" identically and hide.
    const epochMicros = (ts) => {
      const wholeMs = Date.parse(ts.replace(/\.\d+/, ''))
      const fraction = (/\.(\d+)/.exec(ts)?.[1] ?? '').padEnd(6, '0')
      return BigInt(wholeMs) * 1000n + BigInt(fraction)
    }
    const serverOrder = (a, b) => {
      const ta = epochMicros(a.created_at)
      const tb = epochMicros(b.created_at)
      if (ta !== tb) return ta < tb ? 1 : -1
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
    }

    const server = new Map() // id -> { groupId, bill }
    const listFor = (groupId, ids) =>
      [...server.values()]
        .filter((e) => e.groupId === groupId && (!ids || ids.includes(e.bill.id)))
        .map((e) => JSON.parse(JSON.stringify(e.bill)))
        .sort(serverOrder)

    let events = []
    const emit = (table, eventType, row) =>
      events.push({ table, payload: { eventType, new: eventType === 'DELETE' ? {} : row, old: eventType === 'DELETE' ? row : {} } })

    const addBill = (groupId) => {
      const b = { id: newId(), group_id: groupId, created_at: stamp(), title: 't', items: [], bill_payers: [] }
      server.set(b.id, { groupId, bill: b })
      if (groupId === 'G') emit('bills', 'INSERT', { id: b.id, group_id: groupId })
      return b
    }
    const billsOf = (groupId) => [...server.values()].filter((e) => e.groupId === groupId).map((e) => e.bill)

    for (let n = 0; n < 6; n++) addBill(pick(['G', 'H']))

    // The page loads fully once, then only patches.
    const relevance = createRealtimeRelevance()
    let page = listFor('G')
    relevance.learn(page)
    events = []

    for (let step = 0; step < steps; step++) {
      const groupId = rand() < 0.7 ? 'G' : 'H'
      const pool = billsOf(groupId)
      const action = pool.length === 0 ? 'addBill' : pick(['addBill', 'deleteBill', 'editDate', 'rename', 'addItem', 'addItem', 'deleteItem', 'reprice', 'toggleShare', 'toggleShare'])
      const target = pool.length ? pick(pool) : null

      if (action === 'addBill') addBill(groupId)
      else if (action === 'deleteBill') {
        server.delete(target.id)
        // Cascade: realtime delivers the children's deletes too, in any order.
        for (const item of target.items) {
          for (const s of item.item_shares) emit('item_shares', 'DELETE', { item_id: item.id, member_id: s.member_id })
          emit('items', 'DELETE', { id: item.id })
        }
        emit('bills', 'DELETE', { id: target.id })
      } else if (action === 'editDate' || action === 'rename') {
        if (action === 'editDate') target.created_at = stamp()
        else target.title = `t${step}`
        if (groupId === 'G') emit('bills', 'UPDATE', { id: target.id, group_id: groupId })
      } else if (action === 'addItem') {
        const item = { id: newId(), total_price: Math.floor(rand() * 100), category_id: null, item_shares: [] }
        target.items.push(item)
        emit('items', 'INSERT', { id: item.id, bill_id: target.id })
      } else if (target.items.length === 0) {
        continue
      } else {
        const item = pick(target.items)
        if (action === 'deleteItem') {
          target.items = target.items.filter((it) => it.id !== item.id)
          for (const s of item.item_shares) emit('item_shares', 'DELETE', { item_id: item.id, member_id: s.member_id })
          emit('items', 'DELETE', { id: item.id })
        } else if (action === 'reprice') {
          item.total_price = Math.floor(rand() * 100)
          emit('items', 'UPDATE', { id: item.id, bill_id: target.id })
        } else {
          const member = pick(['m1', 'm2', 'm3'])
          const existing = item.item_shares.find((s) => s.member_id === member)
          if (existing) {
            item.item_shares = item.item_shares.filter((s) => s !== existing)
            emit('item_shares', 'DELETE', { item_id: item.id, member_id: member })
          } else {
            item.item_shares.push({ member_id: member, shares: 1 })
            emit('item_shares', 'INSERT', { item_id: item.id, member_id: member, shares: 1 })
          }
        }
      }

      // Every few steps, the page drains its queue, as the runner would.
      if (step % 3 === 2 || step === steps - 1) {
        // Realtime doesn't promise order across a burst. Queued and planned
        // with the same functions GroupView uses.
        const burst = events.sort(() => rand() - 0.5)
        events = []
        const pending = emptyPending()
        for (const { table, payload } of burst) queueAffected(pending, relevance.affectedBills(table, payload))
        const plan = planSync(pending, { fullyLoaded: true, maxBills: Infinity })
        if (plan.kind === 'full') {
          page = listFor('G')
          relevance.learn(page)
        } else if (plan.kind === 'patch') {
          const fetched = listFor('G', plan.billIds)
          relevance.learn(fetched)
          page = applyBillPatch(page, plan.billIds, fetched)
        }
        const diff = diffBillLists(listFor('G'), page)
        if (diff.length) throw new Error(`seed ${seed}, step ${step}: patched list diverged on ${diff.join(', ')}`)
      }
    }
    return page
  }

  it.each([1, 2, 3, 42, 1337, 2026, 9999, 123456])('seed %i: 300 random changes, never diverges', (seed) => {
    expect(() => simulate(seed, 300)).not.toThrow()
  })
})
