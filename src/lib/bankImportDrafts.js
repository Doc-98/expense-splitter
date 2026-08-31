import { supabase } from '../supabaseClient'

// Thin persistence layer over bank_import_drafts — see that table's own
// comment in schema.sql for the full shape/reasoning. Everything here is
// deliberately dumb storage: no parsing, no detection logic, just getting
// ImportBankStatement.jsx's in-memory state to and from a row that
// survives a closed tab.
//
// duplicateIndexes/crossGroupMatches travel as a Set and a Map in memory
// (see bankStatementDetection.js) but jsonb can't hold either natively —
// converted to a plain array and a plain object (string keys, jsonb's own
// requirement) on the way in, and back on the way out.

export async function fetchDraft(groupId) {
  const { data, error } = await supabase.from('bank_import_drafts').select('*').eq('group_id', groupId).maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: data.id,
    transactions: data.transactions,
    review: data.review,
    duplicateIndexes: new Set(data.duplicate_indexes || []),
    crossGroupMatches: new Map(Object.entries(data.cross_group_matches || {})),
    currentPosition: data.current_position,
  }
}

export async function createDraft(groupId, userId, { transactions, review, duplicateIndexes, crossGroupMatches }) {
  const { data, error } = await supabase
    .from('bank_import_drafts')
    .insert({
      group_id: groupId,
      created_by: userId,
      transactions,
      review,
      duplicate_indexes: [...duplicateIndexes],
      cross_group_matches: Object.fromEntries(crossGroupMatches),
      current_position: 0,
    })
    .select()
    .single()
  if (error) throw error
  return data.id
}

// `review` and `currentPosition` are the only two columns the wizard ever
// changes after creation — transactions/duplicate flags are fixed for the
// life of the draft (see schema.sql's own comment on why). Called on
// every Next/Back that actually commits something, not on pure
// navigation, so a browser closed between two saved points loses at most
// one still-being-edited card, never anything already confirmed.
//
// `currentPosition` is optional — the background category-suggestion
// pass calls this to persist newly-suggested categories without knowing
// (or wanting to touch) wherever the person has actually navigated to by
// the time its AI call resolves, which can easily be later than when it
// started. Omitting it here, rather than writing some stale captured
// value, leaves the column exactly as Back/Next themselves left it.
export async function updateDraftReview(draftId, { review, currentPosition }) {
  const patch = { review, updated_at: new Date().toISOString() }
  if (currentPosition !== undefined) patch.current_position = currentPosition
  const { error } = await supabase.from('bank_import_drafts').update(patch).eq('id', draftId)
  if (error) throw error
}

export async function deleteDraft(draftId) {
  const { error } = await supabase.from('bank_import_drafts').delete().eq('id', draftId)
  if (error) throw error
}
