// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { processDueRecurringBills } from './recurringBills'

// The date rules and the catching up now live in the database
// (recurring_next_due / generate_due_recurring_bills in supabase/schema.sql),
// so what's left here is the call itself.
describe('processDueRecurringBills', () => {
  it("asks the database for just this group's due bills, and reports how many it made", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null })
    await expect(processDueRecurringBills({ rpc }, 'group-1')).resolves.toEqual({ created: 2 })
    expect(rpc).toHaveBeenCalledWith('process_due_recurring_bills', { target_group_id: 'group-1' })
  })

  it('treats an empty answer as nothing created', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    await expect(processDueRecurringBills({ rpc }, 'group-1')).resolves.toEqual({ created: 0 })
  })

  it('passes a database error on to the caller', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error('network down') })
    await expect(processDueRecurringBills({ rpc }, 'group-1')).rejects.toThrow('network down')
  })
})
