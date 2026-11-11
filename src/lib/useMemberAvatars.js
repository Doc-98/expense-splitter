import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { setMemberAvatar } from './members'
import { groupRosterCache } from './groupRosterCache'
import { loadErrorMessage } from './loadErrorMessage'

// Changing avatars from Group settings' Members and Guests rows (see
// MemberAvatar.jsx): whose picker is open, who you may change, and saving
// a pick. You may change your own, any guest's, and, as the admin,
// everyone's. A save shows at once and is put back if it fails; the
// shared roster cache follows, so the other tab agrees.
// ?avatar=<member id> opens that row's picker straight away: the group
// page's "look the same" notice links here with it.
export function useMemberAvatars({ groupId, members, setMembers, myUserId, isAdmin, setError }) {
  const [searchParams] = useSearchParams()
  const [openId, setOpenId] = useState(() => searchParams.get('avatar'))

  function canChange(member) {
    return member.active && (member.isGuest || member.userId === myUserId || Boolean(isAdmin))
  }

  function toggle(memberId) {
    setOpenId((current) => (current === memberId ? null : memberId))
  }

  function apply(memberId, iconId) {
    const next = members.map((m) =>
      m.id === memberId ? { ...m, groupAvatarIcon: iconId, avatarIcon: iconId || m.defaultAvatarIcon || null } : m
    )
    setMembers(next)
    const cached = groupRosterCache.get(groupId)
    if (cached) groupRosterCache.set(groupId, { ...cached, members: next })
    return next
  }

  async function pick(member, iconId) {
    const previous = member.groupAvatarIcon
    apply(member.id, iconId)
    // A brief pause before folding the picker away, long enough to see the
    // tile you tapped light up (same as Settings > Profile's picker).
    setTimeout(() => setOpenId((current) => (current === member.id ? null : current)), 220)
    setError(null)
    try {
      await setMemberAvatar(member.id, iconId, { asAdmin: !member.isGuest && member.userId !== myUserId })
    } catch (err) {
      apply(member.id, previous)
      setError(`Couldn't change ${member.name}'s avatar: ${loadErrorMessage(err)}`)
    }
  }

  return { openId, toggle, canChange, pick }
}
