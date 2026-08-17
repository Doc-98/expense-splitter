import { supabase } from '../supabaseClient'

// group_members.user_id and profiles.id both point at auth.users, but not at
// each other directly — so Supabase can't auto-join them in one embedded
// query (that was the cause of the empty "paid by" dropdown, early on). Two
// plain queries, merged here, sidesteps that entirely.
//
// Every entry returned here is a "participant": either a real account
// (userId set, name resolved from profiles) or a guest with no account at
// all (userId null, name is whatever was typed in when they were added).
// `id` is always group_members.id — that's the ID bills/items/payments
// actually reference now, for both kinds alike.

// Everyone who has ever been part of the group, active or not (someone who
// left keeps a row with active=false rather than being deleted, so their
// name still resolves correctly on old bills/items/payments — same for a
// guest that's been archived). Each entry has an `active` flag the UI uses
// to decide whether they're selectable for new things.
export async function fetchAllGroupMembers(groupId) {
  const { data: memberRows, error: memberError } = await supabase
    .from('group_members')
    .select('id, user_id, display_name, active')
    .eq('group_id', groupId)

  if (memberError) throw memberError

  const realUserIds = (memberRows || []).filter((r) => r.user_id).map((r) => r.user_id)

  let nameById = new Map()
  if (realUserIds.length > 0) {
    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', realUserIds)

    if (profileError) throw profileError
    nameById = new Map((profileRows || []).map((p) => [p.id, p.display_name]))
  }

  return (memberRows || []).map((r) => ({
    id: r.id,
    userId: r.user_id, // null for guests; used to check "is this me"
    isGuest: !r.user_id,
    name: r.user_id ? nameById.get(r.user_id) || 'Someone' : r.display_name,
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

// Adds a guest to the group — a person with no account of their own.
export async function addGuest(groupId, displayName) {
  const { error } = await supabase
    .from('group_members')
    .insert({ group_id: groupId, display_name: displayName })
  if (error) throw error
}

// Archives (or restores) a guest. Unlike a real member leaving, this is
// just a plain flag flip — a guest never had login-gated access to lose,
// so there's no departure snapshot involved.
export async function setGuestActive(participantId, active) {
  const { error } = await supabase
    .from('group_members')
    .update({ active })
    .eq('id', participantId)
  if (error) throw error
}

export async function renameGuest(participantId, displayName) {
  const { error } = await supabase
    .from('group_members')
    .update({ display_name: displayName })
    .eq('id', participantId)
  if (error) throw error
}
