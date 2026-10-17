import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { fetchCategories } from '../lib/categories'
import { snapshotAndRemoveMember } from '../lib/leaveGroup'
import { fetchGroupRosterData } from '../lib/prefetchGroupSettings'
import { groupRosterCache } from '../lib/groupRosterCache'
import InviteMenu from './InviteMenu'
import ConfirmSheet from './ConfirmSheet'
import { useConfirm } from '../lib/useConfirm'

// Real accounts only — Guests moved to its own tab (see
// GroupGuestsSection.jsx), and "Leave this group" moved out entirely, into
// Danger Zone (every member can leave, not just an admin action, so it
// reads oddly sitting in a list of things mostly gated on being the
// admin). What's left here is squarely about *other* people: who's in,
// who's the admin, and — for the admin only — handing off that role or
// removing someone.
export default function GroupMembersSection() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const { confirm, sheetProps: confirmSheet } = useConfirm()

  // Seeded straight from groupRosterCache when there's anything there —
  // either a prefetch fired the instant the group page's own Settings
  // (gear) icon was clicked (see prefetchGroupSettings.js/GroupView.jsx)
  // or a previous visit this session — same "paint from cache, then
  // quietly revalidate" trick groupViewCache.js already gets GroupView.jsx
  // itself. Shared with GroupGuestsSection.jsx — see groupRosterCache.js's
  // own comment for why that's one cache entry, not two.
  const cached = groupRosterCache.get(groupId)
  const [name, setName] = useState(cached?.name ?? '')
  const [adminId, setAdminId] = useState(cached?.adminId ?? null)
  const [inviteCode, setInviteCode] = useState(cached?.inviteCode ?? '')
  const [members, setMembers] = useState(cached?.members ?? [])
  const [error, setError] = useState(null)

  // Derived from the roster this section already fetches for its own list,
  // same as the old monolithic page did — no separate query just to know
  // "am I the admin here" (see lib/groupRole.js for the sections that
  // don't otherwise fetch the roster and do need one).
  const myParticipantId = members.find((m) => m.userId === user.id)?.id
  const isAdmin = myParticipantId && myParticipantId === adminId

  const load = useCallback(async () => {
    setError(null)
    try {
      const data = await fetchGroupRosterData(groupId)
      setName(data.name)
      setAdminId(data.adminId)
      setInviteCode(data.inviteCode)
      setMembers(data.members)
      groupRosterCache.set(groupId, data)
    } catch (err) {
      setError(err.message)
    }
  }, [groupId])

  useEffect(() => {
    load()
  }, [load])

  async function makeAdmin(member) {
    const confirmed = await confirm({
      title: `Make ${member.name} the admin?`,
      body: "You'll no longer be able to remove other members yourself.",
      confirmLabel: 'Make admin',
      tone: 'primary',
    })
    if (!confirmed) return
    setError(null)
    const { error: transferError } = await supabase.rpc('transfer_admin', {
      target_group_id: groupId,
      new_admin_id: member.id,
    })
    if (transferError) {
      setError(transferError.message)
    } else {
      load()
    }
  }

  // Only ever removes someone *else* now — leaving yourself moved to
  // Danger Zone. snapshotAndRemoveMember (shared with Danger Zone's own
  // Leave, and the account Settings page's) is what actually computes a
  // real frozen balance/daily-totals snapshot before the membership goes —
  // categories are fetched fresh here just to feed that, same reasoning as
  // every other one-off fetch in this restructure (rare enough action that
  // a dedicated round-trip when it's actually clicked beats keeping
  // category data in this section's state at all times just in case).
  async function removeMember(member) {
    const confirmed = await confirm({
      title: `Remove ${member.name} from the group?`,
      body: 'Their stats for this group are kept, just frozen as of right now.',
      confirmLabel: 'Remove',
    })
    if (!confirmed) return
    setError(null)
    try {
      const categories = await fetchCategories(groupId)
      await snapshotAndRemoveMember({ groupId, groupName: name, member, categories })
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  const activeRealMembers = members.filter((m) => m.active && !m.isGuest)
  const formerRealMembers = members.filter((m) => !m.active && !m.isGuest)

  return (
    <>
      <div className="settings-section-title-row">
        <h2 className="settings-section-title">Members ({activeRealMembers.length})</h2>
        <InviteMenu inviteUrl={inviteCode ? `${window.location.origin}/join/${inviteCode}` : ''} groupName={name} />
      </div>
      <ul className="member-list">
        {activeRealMembers.map((m) => {
          const isSelf = m.userId === user.id
          const isThisMemberAdmin = m.id === adminId
          return (
            <li key={m.id} className="member-list-item">
              <span>
                {m.name}
                {isSelf && <span className="muted"> (you)</span>}
                {isThisMemberAdmin && <span className="muted"> (admin)</span>}
              </span>
              {isAdmin && !isThisMemberAdmin && (
                <span className="member-list-actions">
                  <button type="button" className="btn-link" onClick={() => makeAdmin(m)}>
                    Make admin
                  </button>
                  <button type="button" className="btn-link dropdown-item-warn" onClick={() => removeMember(m)}>
                    Remove
                  </button>
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {!isAdmin && (
        <p className="muted">
          Only the group admin can remove other members — see Danger Zone to leave yourself, any
          time.
        </p>
      )}

      {formerRealMembers.length > 0 && (
        <>
          <h2 className="settings-section-title">Former members</h2>
          <p className="muted">
            They've left the group, but their bills, items, and payments are still kept — and their
            own stats page keeps a frozen record of what they spent here. If they use the invite
            link again, they'll pick up right where they left off.
          </p>
          <ul className="member-list">
            {formerRealMembers.map((m) => (
              <li key={m.id} className="member-list-item former">
                <span>{m.name}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {error && <p className="status-error">{error}</p>}
      {confirmSheet && <ConfirmSheet {...confirmSheet} />}
    </>
  )
}
