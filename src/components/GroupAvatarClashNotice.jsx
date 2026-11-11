import { useState } from 'react'
import { Link } from 'react-router-dom'
import AvatarGlyph from './AvatarGlyph'
import { avatarClashes, clashFix, clashSignature } from '../lib/avatarClashes'
import { prefetchGroupSettings } from '../lib/prefetchGroupSettings'

const HIDDEN_KEY = 'spesa-hidden-avatar-clashes'

function readHidden() {
  try {
    return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

// "Anna and Andrea", "You, Anna and Andrea".
function namesOf(members, myParticipantId) {
  const names = members.map((m) => (m.id === myParticipantId ? 'You' : m.name))
  const ordered = names.includes('You') ? ['You', ...names.filter((n) => n !== 'You')] : names
  return ordered.length === 2 ? ordered : [ordered.slice(0, -1).join(', '), ordered.at(-1)]
}

// A hint on the group page when two or more people here look the same on
// bills (avatarClashes.js: the same icon, or no icon and the same initial),
// shown only to someone who can sort it out (clashFix): "Pick avatars"
// opens Group settings on that person's row with the picker open. × hides
// it on this device for this exact set of people; a new clash shows again.
// One clash at a time, the first one that's yours to fix.
export default function GroupAvatarClashNotice({ groupId, members, myParticipantId, isAdmin }) {
  const [hidden, setHidden] = useState(readHidden)

  const clash = avatarClashes(members).find(
    (c) => clashFix(c, { myParticipantId, isAdmin }) && !hidden.has(`${groupId}:${clashSignature(c)}`)
  )
  if (!clash) return null
  const fix = clashFix(clash, { myParticipantId, isAdmin })
  const [first, second] = namesOf(clash.members, myParticipantId)

  function hide() {
    const next = new Set(hidden).add(`${groupId}:${clashSignature(clash)}`)
    setHidden(next)
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]))
    } catch {
      // Hidden for this visit only, then.
    }
  }

  return (
    <div className="avatar-clash-note" role="status">
      <span className="avatar-pair" aria-hidden="true">
        {clash.members.slice(0, 2).map((m) => (
          <span key={m.id} className="avatar">
            <AvatarGlyph iconId={m.avatarIcon} name={m.name} size={15} />
          </span>
        ))}
      </span>
      <span className="avatar-clash-body">
        <span>
          <strong>{first}</strong> and <strong>{second}</strong> look the same on bills.
        </span>
        <Link
          to={`/groups/${groupId}/settings?section=${fix.section}&avatar=${fix.memberId}`}
          className="btn-link avatar-clash-action"
          onClick={() => prefetchGroupSettings(groupId)}
        >
          Pick avatars
        </Link>
      </span>
      <button type="button" className="avatar-clash-dismiss" onClick={hide} aria-label="Hide this">
        ×
      </button>
    </div>
  )
}
