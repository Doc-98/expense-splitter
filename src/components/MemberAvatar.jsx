import AvatarGlyph from './AvatarGlyph'
import AvatarPicker from './AvatarPicker'
import { takenAvatarIcons } from '../lib/avatarClashes'

// Someone's avatar in this group, at the start of their row in Group
// settings' Members or Guests: the circle bills show for them. When you
// may change it (see useMemberAvatars.js) it's a button that opens the
// picker under the row; otherwise it's just the circle.
export function MemberAvatarButton({ member, canChange, isOpen, onToggle }) {
  const glyph = <AvatarGlyph iconId={member.avatarIcon} name={member.name} size={19} />
  if (!canChange) {
    return (
      <span className="avatar member-row-avatar is-static" aria-hidden="true">
        {glyph}
      </span>
    )
  }
  return (
    <button
      type="button"
      className={`avatar member-row-avatar ${isOpen ? 'is-editing' : ''}`}
      onClick={onToggle}
      aria-expanded={isOpen}
      aria-label={`Choose ${member.name}'s avatar`}
    >
      {glyph}
    </button>
  )
}

// The picker itself, folded under the row (.xwrap/.xinner, opened by an
// .is-open on the row). Leaves out icons someone else in the group already
// has. "Nothing chosen" means the account's own default for a member,
// their initial for a guest. `isYou` only changes that tile's label.
export function MemberAvatarPanel({ member, roster, onPick, isOpen, isYou = false }) {
  const hidden = takenAvatarIcons(roster, member.id)
  return (
    // inert while folded, so its tiles aren't tabbed through unseen.
    <div className="xwrap" inert={!isOpen}>
      <div className="xinner">
        <div className="member-avatar-panel">
          <AvatarPicker
            value={member.groupAvatarIcon}
            onChange={(iconId) => onPick(member, iconId)}
            name={member.name}
            hiddenIds={hidden}
            defaultIconId={member.defaultAvatarIcon}
            noneLabel={
              member.isGuest ? 'No icon — their initial' : isYou ? 'Your account default' : 'Their account default'
            }
          />
          {hidden.size > 0 && (
            <p className="muted member-avatar-hint">Avatars someone else here already has aren't shown.</p>
          )}
        </div>
      </div>
    </div>
  )
}
