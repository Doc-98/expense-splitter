import { AVATAR_ICONS } from './avatarIcons'
import AvatarGlyph from './AvatarGlyph'

// The 16-icon grid, shared by Settings > Profile (the account-wide
// default) and Group settings' Members and Guests (someone's avatar in
// one group, see MemberAvatar.jsx) — avatarIcons.jsx holds the set itself
// and members.js how the two resolve into what a bill's split-with
// avatars actually show.
// The first tile is "nothing chosen" (value null): the initial from
// `name`, or, in a group, the account's own default (`defaultIconId`),
// since that's what then shows. `noneLabel` says which.
// `hiddenIds` (a Set) leaves out icons someone else in the group already
// shows (see takenAvatarIcons in avatarClashes.js), so a per-group pick
// can't create a look-alike; the current pick always stays.
export default function AvatarPicker({
  value,
  onChange,
  name,
  hiddenIds,
  defaultIconId = null,
  noneLabel = 'No icon — use your initial',
}) {
  return (
    <div className="avatar-picker">
      <button
        type="button"
        className={`avatar-picker-option ${!value ? 'is-selected' : ''}`}
        onClick={() => onChange(null)}
        aria-label={noneLabel}
        title={noneLabel}
      >
        <AvatarGlyph iconId={defaultIconId} name={name} size={19} />
      </button>
      {AVATAR_ICONS.filter(({ id }) => id === value || !hiddenIds?.has(id)).map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`avatar-picker-option ${value === id ? 'is-selected' : ''}`}
          onClick={() => onChange(id)}
          aria-label={label}
          title={label}
        >
          <Icon size={19} />
        </button>
      ))}
    </div>
  )
}
