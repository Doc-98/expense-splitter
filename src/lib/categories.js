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
