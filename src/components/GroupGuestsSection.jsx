import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { addGuest, setGuestActive, renameGuest, requestClaimLink, deleteGuestPermanently } from '../lib/members'
import { shareOrCopyText } from '../lib/shareText'
import { fetchGroupRosterData } from '../lib/prefetchGroupSettings'
import { groupRosterCache } from '../lib/groupRosterCache'
import { useClickOutside } from '../lib/useClickOutside'
import { useSwipeToDelete } from '../lib/useSwipeToDelete'
import TypedConfirmSheet from './TypedConfirmSheet'

// The "⋮" per-row menu — same shape as GroupCategoriesSection.jsx's own
// CategoryMenu (Rename/Get claim link/Remove instead of Rename/Delete).
// `onOpen` fires the moment the menu opens, before "Get claim link" is
// ever actually clicked — see the comment on ensureClaimToken in the
// parent for why that matters, not just for a snappier click.
function GuestMenu({ guest, claimLinkReady, onOpen, onRename, onGetClaimLink, onRemove }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  useClickOutside(wrapRef, () => setOpen(false), open)

  function toggleOpen() {
    setOpen((o) => {
      if (!o) onOpen()
      return !o
    })
  }

  function run(action) {
    setOpen(false)
    action()
  }

  return (
    <div className="row-menu-wrap" ref={wrapRef}>
      <button type="button" className="row-menu-btn" onClick={toggleOpen} aria-label={`Actions for ${guest.name}`}>
        ⋮
      </button>
      {open && (
        <div className="row-menu-popover">
          <button type="button" className="dropdown-item" onClick={() => run(onRename)}>
            Rename
          </button>
          {/* Disabled rather than hidden while the token's still in
              flight — same reasoning as InviteMenu's "Generating QR
              code…" placeholder: the menu only just opened, so this is
              normally true for a moment at most. Gating on it, instead of
              always calling onGetClaimLink and letting it await the
              token itself, is what actually fixes the "doesn't seem to
              work" report — see ensureClaimToken. */}
          <button type="button" className="dropdown-item" onClick={() => run(onGetClaimLink)} disabled={!claimLinkReady}>
            {claimLinkReady ? 'Get claim link' : 'Get claim link…'}
          </button>
          <button type="button" className="dropdown-item dropdown-item-warn" onClick={() => run(onRemove)}>
            Remove
          </button>
        </div>
      )}
    </div>
  )
}

export default function GroupGuestsSection() {
  const { groupId } = useParams()
  const { user } = useAuth()

  // Seeded straight from groupRosterCache, shared with
  // GroupMembersSection.jsx — see that file's own comment, and
  // groupRosterCache.js for why the two tabs share one cache entry.
  const cached = groupRosterCache.get(groupId)
  const [name, setName] = useState(cached?.name ?? '')
  const [adminId, setAdminId] = useState(cached?.adminId ?? null)
  const [members, setMembers] = useState(cached?.members ?? [])
  const [error, setError] = useState(null)
  const [guestName, setGuestName] = useState('')
  const [editingGuestId, setEditingGuestId] = useState(null)
  const [editingGuestName, setEditingGuestName] = useState('')
  const [claimStatus, setClaimStatus] = useState(null)
  // memberId -> claim_token, filled in as soon as each guest's own ⋮ menu
  // is opened (see ensureClaimToken/GuestMenu's onOpen), not lazily on the
  // "Get claim link" click itself.
  const [claimTokens, setClaimTokens] = useState({})
  const [deleteTarget, setDeleteTarget] = useState(null) // archived guest up for permanent deletion, or null
  const [deleting, setDeleting] = useState(false)

  // One shared swipe-to-delete instance for the whole active-guest list —
  // see useSwipeToDelete.js for why this is called once here rather than
  // once per row, same reasoning ItemRow's list already follows.
  const { bind: bindSwipe } = useSwipeToDelete()

  // Same "derive from the roster this section already has" reasoning as
  // GroupMembersSection — see that file's own comment.
  const myParticipantId = members.find((m) => m.userId === user.id)?.id
  const isAdmin = myParticipantId && myParticipantId === adminId

  const load = useCallback(async () => {
    setError(null)
    try {
      const data = await fetchGroupRosterData(groupId)
      setName(data.name)
      setAdminId(data.adminId)
      setMembers(data.members)
      groupRosterCache.set(groupId, data)
    } catch (err) {
      setError(err.message)
    }
  }, [groupId])

  useEffect(() => {
    load()
  }, [load])

  async function submitAddGuest(e) {
    e.preventDefault()
    if (!guestName.trim()) return
    setError(null)
    try {
      await addGuest(groupId, guestName.trim())
      setGuestName('')
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function saveGuestRename(memberId) {
    if (!editingGuestName.trim()) return
    setError(null)
    try {
      await renameGuest(memberId, editingGuestName.trim())
      setEditingGuestId(null)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function toggleGuestActive(member, active) {
    setError(null)
    try {
      await setGuestActive(member.id, active)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  // Fetching (or generating) a guest's claim token is a real network
  // round trip. shareOrCopyText's navigator.share()/clipboard.writeText()
  // both need a fresh "user activation" that most mobile browsers — iOS
  // Safari especially — drop the moment a real async gap (like a network
  // request) sits between the click and the call, silently rejecting it
  // rather than doing anything visible. That's the actual bug behind "Get
  // claim link doesn't work": the old getClaimLink awaited this fetch
  // *and then* tried to share, so the share/copy call landed well after
  // the click's activation had already expired.
  //
  // Fixed by moving the fetch to menu-open time (see GuestMenu's onOpen)
  // and gating the "Get claim link" item on it being done — so by the
  // time it's actually clickable, the token's already known and the
  // share/copy call below is the direct, synchronous continuation of
  // that specific click, same as InviteMenu's own (never-broken) Share
  // button already is for the group invite link.
  async function ensureClaimToken(memberId) {
    if (claimTokens[memberId]) return claimTokens[memberId]
    const token = await requestClaimLink(memberId)
    setClaimTokens((t) => ({ ...t, [memberId]: token }))
    return token
  }

  function getClaimLink(member) {
    setError(null)
    const token = claimTokens[member.id]
    if (!token) return // menu item is disabled until this exists — shouldn't happen
    const url = `${window.location.origin}/claim/${token}`
    shareOrCopyText(url, `Claim your history in ${name}`).then((result) => {
      if (result === 'copied') {
        setClaimStatus(`Claim link for ${member.name} copied — send it to them directly.`)
        setTimeout(() => setClaimStatus(null), 3000)
      }
    }, (err) => setError(err.message))
  }

  // The actual safety check (zero bills, payments, or subscriptions still
  // referencing this guest) lives server-side, in delete_guest_permanently
  // itself — this just surfaces whatever it says. The sheet stays open on
  // failure (only a successful delete closes it), so exactly why it was
  // rejected — visible in this section's own error banner, showing dimmed
  // through the sheet backdrop — is still right there rather than needing
  // it reopened to see again.
  async function confirmDeletePermanently() {
    if (!deleteTarget) return
    setDeleting(true)
    setError(null)
    try {
      await deleteGuestPermanently(deleteTarget.id)
      setDeleteTarget(null)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  const activeGuests = members.filter((m) => m.active && m.isGuest)
  const archivedGuests = members.filter((m) => !m.active && m.isGuest)

  return (
    <>
      <h2 className="settings-section-title">Guests ({activeGuests.length})</h2>
      <p className="muted">
        People without an account of their own — add anyone who's splitting a bill but doesn't want
        to sign up. They can be assigned to items and settled up with exactly like anyone else. If
        one of them decides to sign up for real later, "Get claim link" gives you a private link
        that hands them this exact history under their own account — send it directly to them, not
        to the whole group.
      </p>
      {claimStatus && <p className="status-success">{claimStatus}</p>}
      <ul className="member-list">
        {activeGuests.map((m) => {
          const swipe = bindSwipe(m.id, () => toggleGuestActive(m, false))
          return (
            <li key={m.id} className="guest-row">
              {editingGuestId === m.id ? (
                <form
                  className="guest-rename-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    saveGuestRename(m.id)
                  }}
                >
                  <input value={editingGuestName} onChange={(e) => setEditingGuestName(e.target.value)} autoFocus />
                  <button type="submit" className="btn-link">
                    Save
                  </button>
                  <button type="button" className="btn-link" onClick={() => setEditingGuestId(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                // The "⋮" menu's popover is an absolutely-positioned
                // overlay that needs to escape upward/downward past this
                // row's own bounds — it can't live inside .guest-row-shell
                // (overflow: hidden, needed to clip the sliding name/
                // delete-strip pair) or it'd get clipped right along with
                // them. So only the name — the part that actually slides
                // — is inside the shell; the menu is a fixed sibling next
                // to it that never moves and isn't subject to that clip.
                <div className="guest-row-outer">
                  <div className="guest-row-shell">
                    <button type="button" className="item-row-delete-action" {...swipe.deleteButton}>
                      Remove
                    </button>
                    <div className="guest-row-name" {...swipe.row}>
                      {m.name} <span className="muted">(guest)</span>
                    </div>
                  </div>
                  <GuestMenu
                    guest={m}
                    claimLinkReady={!!claimTokens[m.id]}
                    onOpen={() => ensureClaimToken(m.id)}
                    onRename={() => {
                      setEditingGuestId(m.id)
                      setEditingGuestName(m.name)
                    }}
                    onGetClaimLink={() => getClaimLink(m)}
                    onRemove={() => toggleGuestActive(m, false)}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <form onSubmit={submitAddGuest} className="inline-form">
        <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Guest's name" />
        <button type="submit" className="btn-primary">
          Add guest
        </button>
      </form>

      {archivedGuests.length > 0 && (
        <>
          <h2 className="settings-section-title">Archived guests</h2>
          <p className="muted">
            Kept on old bills, but won't be offered for new ones. Restore any time — or, if the
            group's admin, delete one permanently instead. That only works once they're not on any
            bill, payment, or subscription anymore; otherwise it's blocked rather than silently
            leaving something broken behind.
          </p>
          <ul className="member-list">
            {archivedGuests.map((m) => (
              <li key={m.id} className="member-list-item former">
                <span>{m.name}</span>
                <span className="member-list-actions">
                  <button type="button" className="btn-link" onClick={() => toggleGuestActive(m, true)}>
                    Restore
                  </button>
                  {isAdmin && (
                    <button type="button" className="btn-link dropdown-item-warn" onClick={() => setDeleteTarget(m)}>
                      Delete permanently
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {deleteTarget && (
        <TypedConfirmSheet
          title="Delete guest permanently"
          body={
            <p>
              This permanently deletes <strong>{deleteTarget.name}</strong> from <strong>{name}</strong> —
              this can't be undone. Only works if they're not on any bill, payment, or subscription
              anymore; if they are, this is blocked and says so rather than leaving something broken
              behind.
            </p>
          }
          confirmWord={deleteTarget.name}
          confirmLabel="Delete permanently"
          pending={deleting}
          onConfirm={confirmDeletePermanently}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {error && <p className="status-error">{error}</p>}
    </>
  )
}
