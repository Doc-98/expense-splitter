import { supabase } from '../supabaseClient'

// group_members.user_id and profiles.id both point at auth.users, but not at
// each other directly — so Supabase can't auto-join them in one embedded
// query (that was the cause of the empty "paid by" dropdown, early on). Two
// plain queries, merged here, sidesteps that entirely.

// Everyone who has ever been part of the group, active or not (someone who
// left keeps a row with active=false rather than being deleted, so their
// name still resolves correctly on old bills/items/payments). Each entry
// has an `active` flag the UI uses to decide whether they're selectable for
// new things.
export async function fetchAllGroupMembers(groupId) {
  const { data: memberRows, error: memberError } = await supabase
    .from('group_members')
    .select('user_id, active')
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
  return memberRows.map((r) => ({
    id: r.user_id,
    name: nameById.get(r.user_id) || 'Someone',
    active: r.active,
  }))
}

// Just the people currently in the group — use this for anything that
// assigns *new* work (who can be picked to pay a new bill, who a new item
// defaults to being split with).
export async function fetchGroupMembers(groupId) {
  const all = await fetchAllGroupMembers(groupId)
  return all.filter((m) => m.active)
}
