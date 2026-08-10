import { supabase } from '../supabaseClient'

// group_members.user_id and profiles.id both point at auth.users, but not at
// each other directly — so Supabase can't auto-join them in one embedded
// query (that was the cause of the empty "paid by" dropdown). Two plain
// queries, merged here, sidesteps that entirely.
export async function fetchGroupMembers(groupId) {
  const { data: memberRows, error: memberError } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)

  if (memberError) throw memberError

  const userIds = (memberRows || []).map((r) => r.user_id)
  if (userIds.length === 0) return []

  const { data: profileRows, error: profileError } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', userIds)

  if (profileError) throw profileError

  const nameById = new Map((profileRows || []).map((p) => [p.id, p.display_name]))
  return userIds.map((id) => ({ id, name: nameById.get(id) || 'Someone' }))
}
