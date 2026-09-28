import AvatarGlyph from './AvatarGlyph'
import { useDoubleTap } from '../lib/doubleTap'
import { avatarSizeSpec } from '../lib/groupViewPreferences'

// A "split with" avatar row: tap an avatar to toggle that member, double-tap
// to make them the only one. Shared by an item's own row (ItemRow), a
// one-item bill's amount card, and the bill's "Next item split with".
//
// Shows every current member, plus anyone who has since left but is still
// selected here — a former member's existing split stays visible on old
// items, but they're never offered where they weren't already picked.
export default function BuyerPicker({ members, selectedIds, onToggle, onOnly, avatarSize }) {
  const tap = useDoubleTap()
  const { iconPx, className: sizeClass } = avatarSizeSpec(avatarSize)
  const selected = new Set(selectedIds)
  const visible = members.filter((m) => m.active || selected.has(m.id))

  return (
    <div className="avatar-row">
      {visible.map((m) => {
        const label = `${m.name}${m.isGuest ? ' (guest)' : ''}${!m.active ? ' (left)' : ''}`
        return (
          <button
            key={m.id}
            type="button"
            className={`avatar ${sizeClass} ${selected.has(m.id) ? 'active' : ''} ${m.active ? '' : 'former'}`}
            title={label}
            aria-label={label}
            aria-pressed={selected.has(m.id)}
            onClick={() => tap(m.id, () => onToggle(m.id), () => onOnly(m.id))}
          >
            <AvatarGlyph iconId={m.avatarIcon} name={m.name} size={iconPx} />
          </button>
        )
      })}
    </div>
  )
}
