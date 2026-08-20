// Advances a due date forward by one period. targetDay is only used for
// monthly/yearly — it's always the *original* target day-of-month (e.g.
// "the 31st"), not whatever the previous occurrence got clamped to, so a
// short month (February) doesn't cause permanent drift afterward. Landing
// in March after being clamped to Feb 28 correctly tries for the 31st
// again, rather than compounding down to the 28th forever.
export function advanceDate(date, frequency, targetDay) {
  if (frequency === 'weekly') {
    const next = new Date(date)
    next.setDate(next.getDate() + 7)
    return next
  }

  if (frequency === 'monthly') {
    const y = date.getFullYear()
    const m = date.getMonth() + 1
    const daysInTargetMonth = new Date(y, m + 1, 0).getDate()
    return new Date(y, m, Math.min(targetDay, daysInTargetMonth))
  }

  if (frequency === 'yearly') {
    const y = date.getFullYear() + 1
    const m = date.getMonth()
    const daysInTargetMonth = new Date(y, m + 1, 0).getDate()
    return new Date(y, m, Math.min(targetDay, daysInTargetMonth))
  }

  return new Date(date)
}

// Every due date from nextDueDate up to and including asOf, plus what the
// template's next_due_date should become afterward. A group that's gone
// quiet for a while catches up on *every* missed occurrence rather than
// skipping ahead to just the most recent one — rent still happened each of
// those months even if nobody opened the app to record it, and silently
// dropping past occurrences would under-count real spending history.
// The iteration cap is defensive only, against a pathological template
// (e.g. corrupted data) causing an effectively infinite loop rather than
// actually protecting against a realistic input.
export function computeDueOccurrences(nextDueDate, frequency, dayOfMonth, asOf) {
  const dueDates = []
  let current = new Date(nextDueDate)
  let iterations = 0

  while (current <= asOf && iterations < 1000) {
    dueDates.push(new Date(current))
    current = advanceDate(current, frequency, dayOfMonth)
    iterations++
  }

  return { dueDates, newNextDueDate: current }
}

function toDateString(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Runs opportunistically whenever someone opens a group (see GroupView.jsx)
// rather than on a schedule — this app has no background/cron
// infrastructure anywhere else, and building one just for this would be a
// meaningfully bigger commitment than the feature calls for. The tradeoff:
// bills appear exactly when they're generated, not exactly on their due
// date, if nobody's opened the group in between.
//
// Re-fetches each template's current next_due_date right before using it,
// rather than trusting a value read earlier — this doesn't fully eliminate
// the (already low-stakes) chance of two people opening the group at the
// same instant both generating the same occurrence, but it narrows the
// window a great deal for negligible extra cost, and a stray duplicate
// bill is a trivial, obvious thing to delete if it ever happened.
export async function processDueRecurringBills(supabase, groupId, userId) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data: templates, error: fetchError } = await supabase
    .from('recurring_bills')
    .select('*')
    .eq('group_id', groupId)
    .eq('active', true)
    .lte('next_due_date', toDateString(today))

  if (fetchError) throw fetchError
  if (!templates || templates.length === 0) return { created: 0 }

  let created = 0

  for (const template of templates) {
    // Re-check against the live value, not the one from the query above,
    // in case another open of this same group already processed it in the
    // brief moment since that fetch.
    const { data: current, error: currentError } = await supabase
      .from('recurring_bills')
      .select('next_due_date')
      .eq('id', template.id)
      .single()
    if (currentError) throw currentError

    const { dueDates, newNextDueDate } = computeDueOccurrences(
      current.next_due_date,
      template.frequency,
      template.day_of_month,
      today
    )
    if (dueDates.length === 0) continue

    for (const occurrence of dueDates) {
      const { data: bill, error: billError } = await supabase
        .from('bills')
        .insert({
          group_id: groupId,
          title: template.title,
          note: template.note,
          paid_by: template.paid_by,
          category_id: template.category_id,
          default_buyer_ids: template.split_member_ids,
          recurring_bill_id: template.id,
          created_by: userId,
          created_at: occurrence.toISOString(),
        })
        .select()
        .single()
      if (billError) throw billError

      const { data: item, error: itemError } = await supabase
        .from('items')
        .insert({
          bill_id: bill.id,
          name: template.title,
          unit_price: template.amount,
          quantity: 1,
          total_price: template.amount,
          category_id: template.category_id,
        })
        .select()
        .single()
      if (itemError) throw itemError

      if (template.split_member_ids?.length > 0) {
        const { error: sharesError } = await supabase
          .from('item_shares')
          .insert(template.split_member_ids.map((memberId) => ({ item_id: item.id, member_id: memberId, shares: 1 })))
        if (sharesError) throw sharesError
      }

      created++
    }

    const { error: advanceError } = await supabase
      .from('recurring_bills')
      .update({ next_due_date: toDateString(newNextDueDate) })
      .eq('id', template.id)
    if (advanceError) throw advanceError
  }

  return { created }
}

export async function fetchRecurringBills(supabase, groupId) {
  const { data, error } = await supabase
    .from('recurring_bills')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

// day_of_month is derived from startDate itself rather than asked for
// separately — one date picker covers both "when does this first happen"
// and "which day of the month should it keep landing on."
export async function addRecurringBill(supabase, groupId, userId, template) {
  const { error } = await supabase.from('recurring_bills').insert({
    group_id: groupId,
    title: template.title,
    note: template.note || null,
    amount: template.amount,
    category_id: template.categoryId || null,
    paid_by: template.paidBy || null,
    split_member_ids: template.splitMemberIds,
    frequency: template.frequency,
    day_of_month: template.startDate.getDate(),
    next_due_date: toDateString(template.startDate),
    created_by: userId,
  })
  if (error) throw error
}

export async function setRecurringBillActive(supabase, templateId, active) {
  const { error } = await supabase.from('recurring_bills').update({ active }).eq('id', templateId)
  if (error) throw error
}

export async function deleteRecurringBill(supabase, templateId) {
  const { error } = await supabase.from('recurring_bills').delete().eq('id', templateId)
  if (error) throw error
}
