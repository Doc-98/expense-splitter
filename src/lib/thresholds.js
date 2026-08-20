import { supabase } from '../supabaseClient'

export async function fetchThresholds(userId) {
  const { data, error } = await supabase
    .from('spending_thresholds')
    .select('id, category_name, amount')
    .eq('user_id', userId)
  if (error) throw error
  return data || []
}

// Upserts by exact category_name match — the plain unique constraint on
// (user_id, category_name) in schema.sql, no case-folding at the DB level.
// Callers always pass the canonical name the app already merged same-named
// categories down to (see mergeCategoriesByName() in lib/categories.js), so
// this never needs to do that matching itself.
export async function saveThreshold(userId, categoryName, amount) {
  const { error } = await supabase
    .from('spending_thresholds')
    .upsert({ user_id: userId, category_name: categoryName, amount }, { onConflict: 'user_id,category_name' })
  if (error) throw error
}

// Clearing a threshold's input deletes the row rather than storing a 0 —
// schema.sql's amount > 0 check means 0 was never a valid stored value
// anyway, and "no row" is the more honest representation of "no budget set"
// than a zero-amount one would be.
export async function deleteThreshold(userId, categoryName) {
  const { error } = await supabase
    .from('spending_thresholds')
    .delete()
    .eq('user_id', userId)
    .eq('category_name', categoryName)
  if (error) throw error
}
