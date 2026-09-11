import { supabase } from '../supabaseClient'
import { clearCachedPersonalGroupId } from './personalGroupCache'
import { groupViewCache } from './groupViewCache'
import { groupStatsCache } from './groupStatsCache'
import { accountStatsCache } from './accountStatsCache'
import { groupsListCache } from './groupsListCache'
import { avatarIconCache } from './avatarIconCache'

// Shared by the Settings page's Sign Out confirm — pulled out of
// AppHeader.jsx (which used to hold the whole account dropdown, sign-out
// button included) so it has exactly one home now that Sign Out lives in
// Settings instead.
//
// On a shared device, stale cached data left behind for the next person to
// sign in on this same tab — a personal-group id, or any of these caches
// (now mirrored to sessionStorage, so surviving even past this tab's own
// reload) — would paint the previous account's data on screen, however
// briefly, or send them straight into that account's own personal group.
// Every one of these is bare module-level state with no account scoping of
// its own, so this is the one place that has to know to clear all of them.
export async function signOutAndClearCaches() {
  clearCachedPersonalGroupId()
  groupsListCache.clear()
  groupViewCache.clear()
  groupStatsCache.clear()
  accountStatsCache.clear()
  avatarIconCache.clear()
  await supabase.auth.signOut()
}
