import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { fetchGroupRole } from '../lib/groupRole'
import { fetchCategories } from '../lib/categories'
import { snapshotAndRemoveMember } from '../lib/leaveGroup'
import ConfirmSheet from './ConfirmSheet'
import TypedConfirmSheet from './TypedConfirmSheet'

// The one section that doesn't fetch a member roster or category list for
// its own sake — "am I the admin" comes from lib/groupRole.js's lighter
// combined query instead (see that file's own comment for why this is the
// one place that's worth sharing rather than each section deriving it from
// a roster it already needed anyway). Categories are still fetched, but
// only right before Leave actually needs them (see leaveGroup below), same
// "rare action, dedicated round-trip when it's actually clicked" reasoning
// as everywhere else in this restructure.
export default function GroupDangerZoneSection() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [role, setRole] = useState(null) // { name, isPersonal, isAdmin, myParticipantId } | null while loading
  const [error, setError] = useState(null)

  const [confirmingLeave, setConfirmingLeave] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [confirmingDeleteAll, setConfirmingDeleteAll] = useState(false)
  const [deletePaymentsToo, setDeletePaymentsToo] = useState(false)
  const [deletingAllBills, setDeletingAllBills] = useState(false)
  const [confirmingDeleteGroup, setConfirmingDeleteGroup] = useState(false)
  const [deletingGroup, setDeletingGroup] = useState(false)

  const loadRole = useCallback(async () => {
    try {
      setRole(await fetchGroupRole(supabase, groupId, user.id))
    } catch (err) {
      setError(err.message)
    }
  }, [groupId, user.id])

  useEffect(() => {
    loadRole()
  }, [loadRole])

  async function leaveGroup() {
    if (!role || leaving) return
    setLeaving(true)
    setError(null)
    try {
      const categories = await fetchCategories(groupId)
      await snapshotAndRemoveMember({
        groupId,
        groupName: role.name,
        member: { id: role.myParticipantId, userId: user.id },
        categories,
      })
      navigate('/')
      // No navigate() failure path to handle — RequireAuth/the groups list
      // load fresh regardless once we're there, same as every other
      // "leave" entry point in the app.
    } catch (err) {
      setError(err.message)
      setLeaving(false)
    }
  }

  // Goes through the delete_all_group_bills RPC rather than a plain client
  // delete — it's the one place that enforces "only the admin can wipe a
  // group's entire bill history," and (when asked) also clears the
  // settle-up ledger in the same step. Items, item_shares, and bill_payers
  // still cascade with each bill via their own FK constraints, same as a
  // single bill delete; payments are only ever touched here if
  // deletePaymentsToo is checked — otherwise this leaves them alone, same
  // as every other delete path in the app.
  async function deleteAllBills() {
    setDeletingAllBills(true)
    setError(null)
    const { error: deleteError } = await supabase.rpc('delete_all_group_bills', {
      target_group_id: groupId,
      delete_payments: deletePaymentsToo,
    })
    setDeletingAllBills(false)
    if (deleteError) {
      setError(deleteError.message)
    } else {
      setConfirmingDeleteAll(false)
      setDeletePaymentsToo(false)
    }
  }

  // The actual nuclear option — see delete_group()'s own comment
  // (schema.sql) for exactly what goes with it. Never offered at all for a
  // personal space (see the JSX below); the RPC enforces the same rule
  // server-side too, so this button's absence here is a UX convenience,
  // not the real boundary.
  async function deleteGroup() {
    setDeletingGroup(true)
    setError(null)
    const { error: deleteError } = await supabase.rpc('delete_group', { target_group_id: groupId })
    setDeletingGroup(false)
    if (deleteError) {
      setError(deleteError.message)
    } else {
      navigate('/')
    }
  }

  if (!role) return null

  return (
    <>
      <h2 className="settings-section-title">Danger zone</h2>

      {!role.isPersonal && (
        <>
          <p className="muted">
            Leaving means losing access to this group's bills and balance unless someone invites
            you back in. Your stats for it are kept, just frozen as of right now.
          </p>
          <button type="button" className="btn-danger" onClick={() => setConfirmingLeave(true)}>
            Leave group
          </button>
        </>
      )}

      <h3 className="settings-subsection-title">Delete all bills</h3>
      <p className="muted">
        Permanently deletes every bill in this group, along with their items and payer splits —
        optionally its settle-up (payment) history too, your choice. Members and categories are
        untouched either way. This can't be undone, and only the group admin can do it.
      </p>
      {role.isAdmin ? (
        <button type="button" className="btn-danger" onClick={() => setConfirmingDeleteAll(true)}>
          Delete all bills
        </button>
      ) : (
        <p className="muted">Only the group admin can delete all bills in this group.</p>
      )}

      {!role.isPersonal && (
        <>
          <h3 className="settings-subsection-title">Delete group</h3>
          <p className="muted">
            Permanently deletes the group itself — every member, guest, category, subscription,
            bill, and payment, all gone with it. There's no undoing this. Only the group admin can
            do it.
          </p>
          {role.isAdmin ? (
            <button type="button" className="btn-danger" onClick={() => setConfirmingDeleteGroup(true)}>
              Delete group
            </button>
          ) : (
            <p className="muted">Only the group admin can delete this group.</p>
          )}
        </>
      )}

      {error && <p className="status-error">{error}</p>}

      {confirmingLeave && (
        <ConfirmSheet
          title={`Leave ${role.name}?`}
          body="You'll lose access to its bills and balance unless someone invites you back in. Your stats for this group are kept, just frozen as of right now."
          confirmLabel={leaving ? 'Leaving…' : 'Leave'}
          onConfirm={leaveGroup}
          onCancel={() => !leaving && setConfirmingLeave(false)}
        />
      )}

      {confirmingDeleteAll && (
        <TypedConfirmSheet
          title="Delete all bills"
          body={
            <>
              <p>
                This permanently deletes every bill in <strong>{role.name}</strong> — all their
                items and payer splits go with them. Members and categories stay untouched. This
                can't be undone.
              </p>
              <label className="delete-all-payments-option">
                <input
                  type="checkbox"
                  checked={deletePaymentsToo}
                  onChange={(e) => setDeletePaymentsToo(e.target.checked)}
                />
                <span>Also delete all settle-up (payment) records</span>
              </label>
            </>
          }
          confirmWord={role.name}
          confirmLabel="Delete all bills"
          pending={deletingAllBills}
          onConfirm={deleteAllBills}
          onCancel={() => {
            setConfirmingDeleteAll(false)
            setDeletePaymentsToo(false)
          }}
        />
      )}

      {confirmingDeleteGroup && (
        <TypedConfirmSheet
          title="Delete group"
          body={
            <p>
              This permanently deletes <strong>{role.name}</strong> itself — every member, guest,
              category, subscription, bill, and payment, all gone with it. This can't be undone.
            </p>
          }
          confirmWord={role.name}
          confirmLabel="Delete group"
          pending={deletingGroup}
          onConfirm={deleteGroup}
          onCancel={() => setConfirmingDeleteGroup(false)}
        />
      )}
    </>
  )
}
