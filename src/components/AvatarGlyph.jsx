import { getAvatarIcon } from './avatarIcons'
import { memberInitial } from '../lib/memberInitial'

// What actually goes inside an .avatar circle — one of the chosen outline
// icons if this person has one set (their own per-group pick, or their
// account default — see members.js's avatarIcon resolution), otherwise the
// plain initial this app has always shown. One place for that fallback so
// ItemRow and BillView's two avatar-row pickers can't drift out of sync.
export default function AvatarGlyph({ iconId, name, size = 14 }) {
  const avatar = iconId ? getAvatarIcon(iconId) : null
  if (avatar) {
    const { Icon } = avatar
    return <Icon size={size} />
  }
  return memberInitial(name)
}
