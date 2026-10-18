function toDateString(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Generating a subscription's due bills happens in the database, not here:
// generate_due_recurring_bills() (supabase/schema.sql) runs every hour on
// its own (pg_cron), and catches up on every missed occurrence, in one
// transaction that also locks the subscription, so two runs can never
// create the same bill twice. Opening a group calls this too, for that
// group only (the database checks you're a member), so a bill shows up
// straight away rather than within the hour. Resolves to { created }.
export async function processDueRecurringBills(supabase, groupId) {
  const { data, error } = await supabase.rpc('process_due_recurring_bills', { target_group_id: groupId })
  if (error) throw error
  return { created: data ?? 0 }
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
