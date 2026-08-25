import { supabase } from '../supabaseClient'

export async function fetchCategories(groupId) {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, color')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function addCategory(groupId, name, color) {
  const { data, error } = await supabase
    .from('categories')
    .insert({ group_id: groupId, name, color })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function renameCategory(categoryId, name) {
  const { error } = await supabase.from('categories').update({ name }).eq('id', categoryId)
  if (error) throw error
}

export async function updateCategoryColor(categoryId, color) {
  const { error } = await supabase.from('categories').update({ color }).eq('id', categoryId)
  if (error) throw error
}

export async function deleteCategory(categoryId) {
  // Bills/items that used this category fall back to "uncategorized"
  // automatically (on delete set null on both FK columns) — nothing else
  // needs to happen here.
  const { error } = await supabase.from('categories').delete().eq('id', categoryId)
  if (error) throw error
}

// A small preset palette rather than a full color picker — keeps adding a
// category a one-tap affair instead of a whole UI of its own.
export const CATEGORY_COLORS = [
  '#4a86e8',
  '#e69138',
  '#6aa84f',
  '#a479e2',
  '#45818e',
  '#cc4125',
  '#999999',
  '#f1c232',
  '#c27ba0',
  '#3d85c6',
]

// The exact starter set create_group() seeds into every new group's own
// categories table (see supabase/schema.sql) — duplicated here as plain
// data, not fetched, so the Thresholds page can show a selector for each of
// them even for someone not in any group yet. If the seeded set in
// schema.sql ever changes, this needs updating to match by hand — there's
// no single source of truth shared between SQL and JS here.
export const DEFAULT_CATEGORIES = [
  { name: 'Groceries', color: '#4a86e8' },
  { name: 'Eating out', color: '#e69138' },
  { name: 'Household', color: '#6aa84f' },
  { name: 'Bills & utilities', color: '#a479e2' },
  { name: 'Transport', color: '#45818e' },
  { name: 'Health', color: '#cc4125' },
  { name: 'Other', color: '#999999' },
]

// Merges categories from any number of groups into one list, deduped by
// name — trimmed and case-insensitive, so "Groceries" from one group and
// "groceries " from another (or a group's own custom tag that happens to
// share a name with one from a different group) are treated as the exact
// same tag. This is what lets a personal spending threshold mean "total
// spending on Groceries everywhere," not just one group's specific row.
// Whichever instance appears *first* in the input wins for the returned
// name/color — callers that care about a deterministic tie-break should
// sort or order their query accordingly (e.g. by created_at).
export function mergeCategoriesByName(categories) {
  const merged = new Map() // lowercased trimmed name -> { name, color }
  for (const cat of categories) {
    const name = cat.name.trim()
    const key = name.toLowerCase()
    if (!merged.has(key)) merged.set(key, { name, color: cat.color })
  }
  return [...merged.values()]
}
