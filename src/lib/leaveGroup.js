import { supabase } from '../supabaseClient'
import { computeDailyTotalsForUser } from './settlement'
import { deriveBillsItemsShares } from './deriveBillData'
import { fetchGroupBills } from './groupViewSnapshot'
import { fetchGroupBalances } from './groupBalances'

// Shared by GroupSettings' member-list "Leave"/"Remove" and the Settings
// page's Groups section "Leave group" — both need to freeze a balance and
// daily-totals snapshot via remove_group_member() before the membership
// disappears, so stats for that group survive after its bills stop being
// queryable. Pulled out here rather than duplicated so the two entry
// points can never quietly drift apart.
//
// `member` is a fetchAllGroupMembers()-shaped row ({ id, userId, ... }) —
// `id` is the group_members.id being removed, `userId` is null for a
// guest. `categories` only needs `id`/`name`, just enough to resolve each
// bill/item's effective category down to a name for the frozen snapshot.
export async function snapshotAndRemoveMember({ groupId, groupName, member, categories }) {
  // Both through the group page's own fast calls: the complete bill list in
  // one go (a plain select used to stop silently at the API's 1000-row cap,
  // freezing a snapshot from a partial history), and the balance computed
  // server-side, the same number the group page shows. remove_group_member
  // recomputes the balance itself too; it's passed for older databases.
  const [billsData, balances] = await Promise.all([
    fetchGroupBills(supabase, groupId),
    fetchGroupBalances(supabase, groupId),
  ])
  const { list: bills, items, itemShares } = deriveBillsItemsShares(billsData)
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]))
  const dailyTotals = computeDailyTotalsForUser(member.id, { bills, items, itemShares, categoryNameById })

  const { error } = await supabase.rpc('remove_group_member', {
    target_group_id: groupId,
    target_user_id: member.userId,
    group_name: groupName,
    snapshot_balance: balances[member.id] || 0,
    snapshot_daily: dailyTotals,
  })
  if (error) throw new Error(error.message)
}
