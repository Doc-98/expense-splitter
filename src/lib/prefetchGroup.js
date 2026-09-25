import { supabase } from '../supabaseClient'
import { fetchAllGroupMembers } from './members'
import { fetchCategories } from './categories'
import { getStatsWindowStart } from './timeRange'
import { fetchGroupBills, computeGroupViewSnapshot } from './groupViewSnapshot'
import { fetchGroupSettlement } from './groupBalances'
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
// snapshot (and the billPersonalTotals/week/monthTotal derived from it) is
// corrected within one fetch cycle the moment the real page loads —
// exactly as tolerated as any other stale-cache paint already is.
//
// The group's balance is NOT windowed the same way, deliberately — it
// comes from fetchGroupSettlement/get_group_balances, computed server-side
// from the group's complete history regardless of what's in `billsData`
// here. This used to be a real, reported bug: an earlier version of this
// function computed the balance client-side from these same windowed bills
// but *every* payment ever made, so an old payment settling bills outside
// the window looked, briefly, like a wildly wrong balance the instant this
// prefetched snapshot painted — corrected a moment later once the real
// load replaced it, but wrong on screen in the meantime. Fetching the
// balance as its own server-computed number sidesteps that mismatch
// entirely, rather than just windowing it more carefully.
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
    const [groupResult, allMembers, categories, billsData, settlement] = await Promise.all([
      supabase.from('groups').select('*').eq('id', groupId).single(),
      fetchAllGroupMembers(groupId),
      fetchCategories(groupId),
      fetchGroupBills(supabase, groupId, { since: windowStart }),
      fetchGroupSettlement(supabase, groupId),
    ])
    if (groupResult.error || !groupResult.data) return

    const { billPersonalTotals, weekTotal, monthTotal } = computeGroupViewSnapshot(billsData)
    groupViewCache.set(groupId, {
      group: groupResult.data,
      allMembers,
      categories,
      bills: billsData,
      billPersonalTotals,
      settlement,
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
