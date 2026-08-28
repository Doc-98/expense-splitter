import { supabase } from '../supabaseClient'
import { fetchAllRows } from './fetchAllRows'
import { fetchAllGroupMembers } from './members'
import { fetchCategories } from './categories'
import { getStatsWindowStart } from './timeRange'
import { GROUP_BILLS_SELECT, computeGroupViewSnapshot } from './groupViewSnapshot'
import { groupViewCache } from './groupViewCache'

// Warms groupViewCache for a group before anyone's actually opened it —
// called from Groups.jsx right after the groups list itself loads, for
// your most recently visited real groups plus the personal group (see
// recentGroups.js/personalGroupCache.js for how those are picked). By the
// time you actually click into one, GroupView.jsx's own cache-hydration
// effect finds this sitting there already and paints instantly — the same
// "paint from cache, then quietly revalidate for real" trick every group
// visit already gets from groupViewCache, just run proactively instead of
// waiting for a click.
//
// Bills are windowed to the same "this year + last year" recent window
// GroupStats.jsx uses for its own fast first paint (getStatsWindowStart),
// not this group's full history — which could be thousands of rows for an
// old, heavily-imported group, and isn't worth spending part of the
// app-boot warm-up on. GroupView.jsx always re-fetches for real on mount
// regardless of this cache, so an older bill missing from this prefetched
// snapshot (and the settlement/totals derived from it) is corrected within
// one fetch cycle the moment the real page loads — exactly as tolerated as
// any other stale-cache paint already is.
//
// Best-effort throughout: this is a background optimization, not a
// user-facing operation, so any failure here (a dropped connection, an RLS
// edge case) is swallowed rather than surfaced — the group's own real load
// pays the normal fetch cost it always would have anyway, nothing is worse
// off than if this had never run.
export async function prefetchGroupView(groupId) {
  if (!groupId || groupViewCache.get(groupId)) return

  try {
    const windowStart = getStatsWindowStart()
    const [groupResult, allMembers, categories, billsData, paymentsData] = await Promise.all([
      supabase.from('groups').select('*').eq('id', groupId).single(),
      fetchAllGroupMembers(groupId),
      fetchCategories(groupId),
      fetchAllRows(() =>
        supabase
          .from('bills')
          .select(GROUP_BILLS_SELECT, { count: 'exact' })
          .eq('group_id', groupId)
          .gte('created_at', windowStart.toISOString())
          .order('created_at', { ascending: false })
      ),
      fetchAllRows(() =>
        supabase
          .from('payments')
          .select('id, from_member, to_member, amount, created_at', { count: 'exact' })
          .eq('group_id', groupId)
          .order('created_at', { ascending: false })
      ),
    ])
    if (groupResult.error || !groupResult.data) return

    const { billPersonalTotals, weekTotal, monthTotal, settlement } = computeGroupViewSnapshot(billsData, paymentsData)
    groupViewCache.set(groupId, {
      group: groupResult.data,
      allMembers,
      categories,
      bills: billsData,
      billPersonalTotals,
      settlement,
      payments: paymentsData,
      weekTotal,
      monthTotal,
    })
  } catch {
    // See the best-effort note above.
  }
}

// Kicks off (without awaiting) a prefetch for the personal group, if it's
// already known — never speculatively creates one; get_or_create_personal_
// group() only ever runs when someone actually opens the Personal tab —
// plus your `limit` most recently visited real groups, filtered against
// `availableGroupIds` so a group you've since left doesn't get warmed for
// no reason. Falls back to `availableGroupIds`' own order for anyone who
// hasn't got enough recorded visits yet (a brand new account, or one
// that's just cleared site data) — better to warm *something* useful than
// nothing at all.
export function warmUpTopGroups(availableGroupIds, recentGroupIds, personalGroupId, limit = 3) {
  const available = new Set(availableGroupIds)
  const ranked = recentGroupIds.filter((id) => available.has(id))
  for (const id of availableGroupIds) {
    if (ranked.length >= limit) break
    if (!ranked.includes(id)) ranked.push(id)
  }
  const targets = personalGroupId ? [personalGroupId, ...ranked.slice(0, limit)] : ranked.slice(0, limit)
  targets.forEach((id) => {
    prefetchGroupView(id)
  })
}
