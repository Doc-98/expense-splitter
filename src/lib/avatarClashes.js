import { memberInitial } from './memberInitial'

// Two people "look the same" when their avatar circles would be identical:
// the same icon, or no icon and the same initial (what AvatarGlyph draws
// then). Only active members count — they're the ones offered on new bills
// and items, where telling people apart matters.
function glyphKey(member) {
  return member.avatarIcon ? `icon:${member.avatarIcon}` : `initial:${memberInitial(member.name)}`
}

// Every set of two or more active members who look the same, in roster
// order: [{ key, members }]. `members` are fetchAllGroupMembers() entries.
export function avatarClashes(members) {
  const byKey = new Map()
  for (const m of members) {
    if (!m.active) continue
    const key = glyphKey(m)
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(m)
  }
  return [...byKey.entries()].filter(([, group]) => group.length > 1).map(([key, group]) => ({ key, members: group }))
}

// The icons other active members already show, which a per-group picker
// leaves out (AvatarPicker's hiddenIds). `exceptMemberId` is whoever the
// picker is for: their own current icon stays pickable.
export function takenAvatarIcons(members, exceptMemberId) {
  return new Set(members.filter((m) => m.active && m.id !== exceptMemberId && m.avatarIcon).map((m) => m.avatarIcon))
}

// Where in Group settings a clash can be sorted out by whoever's looking,
// or null when they can't: { section, memberId } names the settings tab
// and whose avatar to open there. Your own comes first (Members); then a
// guest's (Guests: any member may change a guest); another member's only
// for the admin (Members).
export function clashFix(clash, { myParticipantId, isAdmin }) {
  const me = clash.members.find((m) => m.id === myParticipantId)
  if (me) return { section: 'members', memberId: me.id }
  const guest = clash.members.find((m) => m.isGuest)
  if (guest) return { section: 'guests', memberId: guest.id }
  if (isAdmin) return { section: 'members', memberId: clash.members[0].id }
  return null
}

// A stable name for one clash, for remembering "hide this" until the set of
// people involved changes.
export function clashSignature(clash) {
  return `${clash.key}|${clash.members
    .map((m) => m.id)
    .sort()
    .join(',')}`
}
