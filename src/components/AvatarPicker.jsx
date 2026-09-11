import { AVATAR_ICONS } from './avatarIcons'
import { memberInitial } from '../lib/memberInitial'

// The 16-icon grid, shared by Settings > Profile (the account-wide
// default) and Group Settings > General (a per-group override on top of
// it) — see avatarIcons.jsx for the set itself and members.js for how the
// two resolve into whatever a bill's split-with avatars actually show.
// `name` is only used to preview what "no icon" looks like on the first
// tile — the real initial this picker's owner would otherwise show.
export default function AvatarPicker({ value, onChange, name }) {
  return (
    <div className="avatar-picker">
      <button
        type="button"
        className={`avatar-picker-option ${!value ? 'is-selected' : ''}`}
        onClick={() => onChange(null)}
        aria-label="No icon — use your initial"
        title="No icon"
      >
        {memberInitial(name)}
      </button>
      {AVATAR_ICONS.map(({ id, label, Icon }) => (
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
