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
  // nextDueDate normally arrives as a bare "YYYY-MM-DD" string straight out
  // of Postgres (see processDueRecurringBills below) — parsed as `new
  // Date(nextDueDate)` directly, that's midnight *UTC*, not midnight local,
  // while `asOf` (today, at local midnight) and every other date in this
  // file are always local. In any timezone ahead of UTC, that UTC midnight
  // sits a few hours *later* than local midnight the same calendar day, so
  // a template due "today" compared as `current <= asOf` came out false for
  // the entire day — the first occurrence silently didn't fire until the
  // day after it was actually due. Appending T00:00:00 forces the same
  // local-midnight parse as everywhere else (addRecurringBill's
  // `${startDate}T00:00:00`, the template list's own next-due display).
  let current = typeof nextDueDate === 'string' ? new Date(`${nextDueDate}T00:00:00`) : new Date(nextDueDate)
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

    // newNextDueDate isn't used here — each occurrence below advances
    // next_due_date past itself individually, landing on this same final
    // value by the time the loop finishes (see that comment).
    const { dueDates } = computeDueOccurrences(current.next_due_date, template.frequency, template.day_of_month, today)
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

      // Advanced past this one occurrence immediately, not just once after
      // the whole backlog finishes — a template with several missed
      // occurrences in a row otherwise risks regenerating the earlier ones
      // as duplicates if a later one in the same run fails: next_due_date
      // wouldn't have moved past any of them yet, so the next run would see
      // the same already-inserted occurrences as still due. Advancing right
      // after each one commits means a failure partway through only ever
      // leaves the *remaining* occurrences to pick up next time. On the
      // last occurrence this lands on the exact same date
      // computeDueOccurrences' own newNextDueDate already would have, so
      // there's nothing left to do once the loop finishes.
      const nextOccurrenceDate = advanceDate(occurrence, template.frequency, template.day_of_month)
      const { error: advanceError } = await supabase
        .from('recurring_bills')
        .update({ next_due_date: toDateString(nextOccurrenceDate) })
        .eq('id', template.id)
      if (advanceError) throw advanceError

      created++
    }
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

// Deliberately narrower than addRecurringBill's shape — only the content of
// what gets generated (title/amount/category/who paid/who splits it), never
// frequency or day_of_month. Those two are the schedule's own anchor:
// next_due_date already in the database was computed from them, and
// changing either here without also reconciling that column is exactly the
// kind of edit that silently corrupts a template's future occurrences.
// Delete and recreate covers "I want this on a different schedule" already,
// with none of that risk.
export async function updateRecurringBill(supabase, templateId, template) {
  const { error } = await supabase
    .from('recurring_bills')
    .update({
      title: template.title,
      amount: template.amount,
      category_id: template.categoryId || null,
      paid_by: template.paidBy || null,
      split_member_ids: template.splitMemberIds,
    })
    .eq('id', templateId)
  if (error) throw error
}

// What's actually at stake if this template's generated bills get deleted
// along with it — shown in the delete confirmation so that choice is made
// with real numbers in front of it, not blind.
export async function countRecurringBillOccurrences(supabase, templateId) {
  const { data, error } = await supabase
    .from('bills')
    .select('id, items(total_price)')
    .eq('recurring_bill_id', templateId)
  if (error) throw error
  const bills = data || []
  const total = bills.reduce((sum, b) => sum + (b.items || []).reduce((s, it) => s + Number(it.total_price), 0), 0)
  return { count: bills.length, total }
}

// Deleting just the template (deleteOccurrences=false, the default) leaves
// every bill it already generated exactly as it was — bills.recurring_bill_id
// is "on delete set null", so they just stop being linked to a template
// that no longer exists. deleteOccurrences=true is an explicit, separately
// confirmed choice to actually remove those bills too (which cascades to
// their items/item_shares/bill_payers via the existing FK cascades on
// those tables) — for undoing a template that turned out to be wrong
// entirely, rather than quietly leaving a pile of incorrect bills behind
// for someone to clean up by hand.
export async function deleteRecurringBill(supabase, templateId, deleteOccurrences = false) {
  if (deleteOccurrences) {
    const { error: billsError } = await supabase.from('bills').delete().eq('recurring_bill_id', templateId)
    if (billsError) throw billsError
  }
  const { error } = await supabase.from('recurring_bills').delete().eq('id', templateId)
  if (error) throw error
}
