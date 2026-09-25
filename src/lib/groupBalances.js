import { simplifyDebts } from './settlement'

// Fetches each member's net balance for a group, computed entirely
// server-side (see get_group_balances in
// supabase/migrations/20260923213308_group_balances_rpc.sql) rather than
// downloading every bill/item/share/payment in the group's history just to
// add it up on the device — the one part of that math still worth doing
// client-side is the actual debt-simplification (matching up who should
// pay whom), which stays exactly where it's always been, in
// simplifyDebts()/settlement.js. That part is cheap (one row per member,
// not per bill) and there's no reason to move it.
export async function fetchGroupSettlement(supabase, groupId) {
  return simplifyDebts(await fetchGroupBalances(supabase, groupId))
}

// Every member's net balance, { [memberId]: number } — the same server-side
// numbers the settlement above is built from, for callers that need one
// person's figure (leaving a group, Your Stats' overall balance) rather
// than who-owes-whom.
export async function fetchGroupBalances(supabase, groupId) {
  const { data, error } = await supabase.rpc('get_group_balances', { target_group_id: groupId })
  if (error) throw error
  // Supabase returns numeric columns as strings, not numbers — same
  // defensive Number(...) wrap every other money read in this app already
  // needs (see AccountStats.jsx's own thresholdRows, for one).
  return Object.fromEntries((data || []).map((row) => [row.member_id, Number(row.balance)]))
}
