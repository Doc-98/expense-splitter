// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { advanceDate, computeDueOccurrences, processDueRecurringBills } from './recurringBills'

describe('advanceDate', () => {
  it('adds exactly 7 days for a weekly template', () => {
    expect(advanceDate(new Date(2026, 8, 1), 'weekly', 1)).toEqual(new Date(2026, 8, 8))
  })

  it('advances one calendar month, keeping the same day-of-month', () => {
    expect(advanceDate(new Date(2026, 0, 15), 'monthly', 15)).toEqual(new Date(2026, 1, 15))
  })

  it('clamps to the last day of a short month rather than overflowing into the next one', () => {
    // Jan 31 -> Feb has only 28 days in 2026 (not a leap year).
    expect(advanceDate(new Date(2026, 0, 31), 'monthly', 31)).toEqual(new Date(2026, 1, 28))
  })

  it('recovers to the original target day once a longer month allows it, instead of drifting permanently', () => {
    // targetDay (31) is passed in fresh each call rather than derived from
    // the previous, clamped result — March has 31 days, so this lands back
    // on the 31st instead of compounding down from Feb's clamped 28th.
    const feb = advanceDate(new Date(2026, 0, 31), 'monthly', 31)
    expect(advanceDate(feb, 'monthly', 31)).toEqual(new Date(2026, 2, 31))
  })

  it('advances one calendar year, keeping the same month and day', () => {
    expect(advanceDate(new Date(2026, 5, 10), 'yearly', 10)).toEqual(new Date(2027, 5, 10))
  })

  it('clamps Feb 29 to Feb 28 in a non-leap year', () => {
    expect(advanceDate(new Date(2028, 1, 29), 'yearly', 29)).toEqual(new Date(2029, 1, 28))
  })
})

describe('computeDueOccurrences', () => {
  it('returns nothing when the next due date is still in the future', () => {
    const { dueDates, newNextDueDate } = computeDueOccurrences(
      new Date(2026, 8, 15),
      'monthly',
      15,
      new Date(2026, 8, 1)
    )
    expect(dueDates).toEqual([])
    expect(newNextDueDate).toEqual(new Date(2026, 8, 15))
  })

  it('includes the due date itself (inclusive), not just strictly-past ones', () => {
    const due = new Date(2026, 8, 1)
    expect(computeDueOccurrences(due, 'monthly', 1, due).dueDates).toEqual([due])
  })

  it('catches up every missed occurrence in order, not just the most recent one', () => {
    const { dueDates, newNextDueDate } = computeDueOccurrences(
      new Date(2026, 7, 4),
      'weekly',
      4,
      new Date(2026, 7, 25)
    )
    expect(dueDates).toEqual([
      new Date(2026, 7, 4),
      new Date(2026, 7, 11),
      new Date(2026, 7, 18),
      new Date(2026, 7, 25),
    ])
    expect(newNextDueDate).toEqual(new Date(2026, 8, 1))
  })

  // The actual bug this guards against: `new Date('2026-09-08')` parses as
  // midnight *UTC*, not midnight local. In any timezone ahead of UTC,
  // that's a few hours *later* than local midnight the same calendar day
  // — so re-checking a template's freshly-fetched next_due_date string
  // (see processDueRecurringBills) against `asOf` (today, at local
  // midnight) came out as "still in the future" for the entire day it was
  // actually due, and the first occurrence of a bill starting "today"
  // silently didn't get created until a day late.
  //
  // This only reproduces under a real non-UTC timezone, and this repo's
  // CI/dev container runs in UTC — so, unusually for this codebase, the
  // check runs in a genuine subprocess with TZ set at spawn time, rather
  // than as a plain in-process assertion. Setting `process.env.TZ` mid-test
  // doesn't work here: vitest's worker pool caches each worker's timezone
  // the first time anything touches Date/Intl, and a later env change is
  // silently ignored for the rest of that worker's life (confirmed by hand
  // — a mid-test `process.env.TZ = 'Europe/Rome'` measurably changed
  // nothing) — the only reliable way to observe a different offset is a
  // fresh process that never saw UTC.
  it('parses a bare "YYYY-MM-DD" string as local midnight, so a template due today fires today', () => {
    // Not `fileURLToPath(import.meta.url)` — vitest runs this file through
    // its own module runner, where `import.meta.url` is a vitest-internal
    // URL scheme, not a real `file://` one. Resolved from the repo root
    // (vitest's own working directory) instead.
    const modulePath = path.resolve(process.cwd(), 'src/lib/recurringBills.js')
    const script = `
      import { computeDueOccurrences } from ${JSON.stringify(modulePath)}
      const dueToday = new Date(2026, 8, 8)
      const { dueDates } = computeDueOccurrences('2026-09-08', 'monthly', 8, dueToday)
      if (dueDates.length !== 1 || dueDates[0].getTime() !== dueToday.getTime()) {
        console.error('expected [dueToday], got', dueDates)
        process.exit(1)
      }
    `
    expect(() =>
      execFileSync(process.execPath, ['--input-type=module', '-e', script], {
        env: { ...process.env, TZ: 'Europe/Rome' }, // UTC+1/+2 — ahead of UTC, where this broke
        stdio: 'pipe',
      })
    ).not.toThrow()
  })
})

describe('processDueRecurringBills', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  // A minimal fake of the one Supabase call shape this function actually
  // uses — select/eq/lte/single/insert are all chainable no-ops that just
  // return the same builder, and `.then()` (what `await` actually calls)
  // resolves whatever the next canned response in the queue is, in the
  // exact sequential order processDueRecurringBills awaits them in (it has
  // no Promise.all of its own, so this is reliable). `update` calls are
  // captured separately by their `next_due_date` payload, regardless of
  // when their `.then()` resolves, since that's the one thing this test
  // actually needs to assert on.
  function createSequencedSupabase(responses, updateCalls) {
    const builder = {
      select: () => builder,
      eq: () => builder,
      lte: () => builder,
      single: () => builder,
      insert: () => builder,
      update(payload) {
        updateCalls.push(payload.next_due_date ?? null)
        return builder
      },
      then(resolve) {
        // Real Supabase never rejects on a query error — it always
        // resolves to { data, error }, same as here; it's the app code's
        // own `if (error) throw error` that turns that into a thrown
        // rejection, exactly as processDueRecurringBills does.
        resolve(responses.shift())
      },
    }
    return { from: () => builder }
  }

  it('advances next_due_date past each occurrence as it commits, not only once after the whole backlog', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 15)) // "today" — pinned so the two due occurrences below are deterministic

    const template = {
      id: 'template-1',
      frequency: 'weekly',
      day_of_month: 8,
      title: 'Rent',
      note: null,
      paid_by: null,
      category_id: null,
      split_member_ids: [], // empty — skips the item_shares insert, keeping the call sequence short
      amount: 500,
    }

    const updateCalls = []
    const responses = [
      { data: [template], error: null }, // 1. due-templates list
      { data: { next_due_date: '2026-09-08' }, error: null }, // 2. live re-check — two occurrences due: Sep 8, Sep 15
      { data: { id: 'bill-1' }, error: null }, // 3. occurrence 1 (Sep 8) bill insert
      { data: { id: 'item-1' }, error: null }, // 4. occurrence 1 item insert
      { data: null, error: null }, // 5. occurrence 1's next_due_date advance
      { data: null, error: new Error('network down') }, // 6. occurrence 2 (Sep 15) bill insert fails
    ]
    const supabase = createSequencedSupabase(responses, updateCalls)

    await expect(processDueRecurringBills(supabase, 'group-1', 'user-1')).rejects.toThrow('network down')

    // The one occurrence that actually committed (Sep 8) already advanced
    // next_due_date past itself to Sep 15 — not still stuck at Sep 8 (which
    // would recreate that same bill as a duplicate next run) and not
    // skipped ahead to Sep 22 (which would silently drop the occurrence
    // that just failed).
    expect(updateCalls).toEqual(['2026-09-15'])
  })
})
