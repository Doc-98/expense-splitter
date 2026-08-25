import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import {
  fetchAllGroupMembers,
  addGuest,
  setGuestActive,
  renameGuest,
  requestClaimLink,
  deleteGuestPermanently,
} from '../lib/members'
import {
  fetchCategories,
  addCategory,
  renameCategory,
  deleteCategory,
  updateCategoryColor,
  CATEGORY_COLORS,
} from '../lib/categories'
import { shareOrCopyText } from '../lib/shareText'
import { computeBalances, computeDailyTotalsForUser } from '../lib/settlement'
import TypedConfirmModal from '../components/TypedConfirmModal'
import ColorSwatchPicker from '../components/ColorSwatchPicker'
import CategoryColorButton from '../components/CategoryColorButton'

export default function GroupSettings() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [adminId, setAdminId] = useState(null)
  const [members, setMembers] = useState([])
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [editingGuestId, setEditingGuestId] = useState(null)
  const [editingGuestName, setEditingGuestName] = useState('')
  const [claimStatus, setClaimStatus] = useState(null)
  const [categories, setCategories] = useState([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState(CATEGORY_COLORS[0])
  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false)
  const [deletingAllBills, setDeletingAllBills] = useState(false)
  const [deletePaymentsToo, setDeletePaymentsToo] = useState(false)
  // The archived guest currently up for permanent deletion, or null — a
  // member object rather than just an id, so the confirm modal below has
  // their name to show/type without a second lookup.
  const [deleteGuestTarget, setDeleteGuestTarget] = useState(null)
  const [deletingGuest, setDeletingGuest] = useState(false)

  const myParticipantId = members.find((m) => m.userId === user.id)?.id
  const isAdmin = myParticipantId && myParticipantId === adminId

  const loadGroup = useCallback(async () => {
    const { data } = await supabase.from('groups').select('*').eq('id', groupId).single()
    setName(data?.name || '')
    setAdminId(data?.admin_id || null)
  }, [groupId])

  const loadMembers = useCallback(async () => {
    setMembers(await fetchAllGroupMembers(groupId))
  }, [groupId])

  const loadCategories = useCallback(async () => {
    setCategories(await fetchCategories(groupId))
  }, [groupId])

  useEffect(() => {
    loadGroup()
    loadMembers()
    loadCategories()
  }, [loadGroup, loadMembers, loadCategories])

  async function saveName(e) {
    e.preventDefault()
    if (!name.trim()) return
    const { error: renameError } = await supabase
      .from('groups')
      .update({ name: name.trim() })
      .eq('id', groupId)
    if (renameError) {
      setError(renameError.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    }
  }

  async function submitAddGuest(e) {
    e.preventDefault()
    if (!guestName.trim()) return
    setError(null)
    try {
      await addGuest(groupId, guestName.trim())
      setGuestName('')
      loadMembers()
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
      loadMembers()
    } catch (err) {
      setError(err.message)
    }
  }

  async function toggleGuestActive(member, active) {
    setError(null)
    try {
      await setGuestActive(member.id, active)
      loadMembers()
    } catch (err) {
      setError(err.message)
    }
  }

  // The actual safety check (zero bills, payments, or recurring templates
  // still referencing this guest) lives server-side, in
  // delete_guest_permanently itself — this just surfaces whatever it
  // says, same as handleDeleteAllBills does for its own RPC. The modal
  // stays open on failure (only a successful delete closes it), so
  // exactly why it was rejected — visible in the page's own error banner,
  // showing dimmed through the modal backdrop — is still right there
  // rather than needing the dialog reopened to see it again.
  async function confirmDeleteGuestPermanently() {
    if (!deleteGuestTarget) return
    setDeletingGuest(true)
    setError(null)
    try {
      await deleteGuestPermanently(deleteGuestTarget.id)
      setDeleteGuestTarget(null)
      loadMembers()
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingGuest(false)
    }
  }

  async function getClaimLink(member) {
    setError(null)
    try {
      const token = await requestClaimLink(member.id)
      const url = `${window.location.origin}/claim/${token}`
      const result = await shareOrCopyText(url, `Claim your history in ${name}`)
      if (result === 'copied') {
        setClaimStatus(`Claim link for ${member.name} copied — send it to them directly.`)
        setTimeout(() => setClaimStatus(null), 3000)
      }
    } catch (err) {
      setError(err.message)
    }
  }

  async function submitAddCategory(e) {
    e.preventDefault()
    if (!newCategoryName.trim()) return
    setError(null)
    try {
      await addCategory(groupId, newCategoryName.trim(), newCategoryColor)
      setNewCategoryName('')
      loadCategories()
    } catch (err) {
      setError(err.message)
    }
  }

  async function saveCategoryRename(categoryId) {
    if (!editingCategoryName.trim()) return
    setError(null)
    try {
      await renameCategory(categoryId, editingCategoryName.trim())
      setEditingCategoryId(null)
      loadCategories()
    } catch (err) {
      setError(err.message)
    }
  }

  // Applied straight away, no confirm step — same as picking a color when
  // first adding a category, and easy enough to undo (click the dot again)
  // that a confirmation would only be friction.
  async function handleCategoryColorChange(categoryId, color) {
    setError(null)
    const previous = categories
    setCategories((cats) => cats.map((c) => (c.id === categoryId ? { ...c, color } : c)))
    try {
      await updateCategoryColor(categoryId, color)
    } catch (err) {
      setCategories(previous)
      setError(err.message)
    }
  }

  async function handleDeleteCategory(category) {
    if (
      !window.confirm(
        `Delete "${category.name}"? Any bills or items tagged with it will become uncategorized — nothing about them is deleted.`
      )
    ) {
      return
    }
    setError(null)
    try {
      await deleteCategory(category.id)
      loadCategories()
    } catch (err) {
      setError(err.message)
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
  async function handleDeleteAllBills() {
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
      setShowDeleteAllModal(false)
      setDeletePaymentsToo(false)
    }
  }

  async function makeAdmin(member) {
    if (!window.confirm(`Make ${member.name} the admin of this group? You'll no longer be able to remove other members yourself.`)) {
      return
    }
    setError(null)
    const { error: transferError } = await supabase.rpc('transfer_admin', {
      target_group_id: groupId,
      new_admin_id: member.id,
    })
    if (transferError) {
      setError(transferError.message)
    } else {
      loadGroup()
    }
  }

  // Real accounts go through remove_group_member — this both revokes their
  // access (they'd otherwise keep querying group data forever) and freezes
  // a personal record of their history first, while they still can. Guests
  // never had that access to begin with, so removing one is just flipping
  // active off directly (see toggleGuestActive above) — no snapshot needed.
  //
  // Only the admin can remove someone else; anyone can still remove
  // themselves — the RPC itself enforces this too, so this is a UX
  // convenience (hiding a button that would fail) not the actual security
  // boundary.
  async function removeRealMember(member) {
    const isSelf = member.userId === user.id
    const label = isSelf ? 'leave this group' : 'remove this person from the group'
    if (
      !window.confirm(
        `Are you sure you want to ${label}? Your stats for this group are kept, just frozen as of right now.`
      )
    ) {
      return
    }

    setError(null)

    const { data: billsData, error: billsError } = await supabase
      .from('bills')
      .select(
        'id, paid_by, created_at, category_id, items(id, total_price, category_id, item_shares(member_id, shares)), bill_payers(member_id, amount)'
      )
      .eq('group_id', groupId)

    if (billsError) {
      setError(billsError.message)
      return
    }

    const bills = (billsData || []).map((b) => ({
      id: b.id,
      paid_by: b.paid_by,
      created_at: b.created_at,
      category_id: b.category_id,
      payers: b.bill_payers || [],
    }))
    const items = []
    const itemShares = []
    for (const bill of billsData || []) {
      for (const item of bill.items || []) {
        items.push({ id: item.id, bill_id: bill.id, total_price: item.total_price, category_id: item.category_id })
        for (const share of item.item_shares || []) {
          itemShares.push({ item_id: item.id, user_id: share.member_id, shares: share.shares })
        }
      }
    }

    const { data: paymentsData, error: paymentsError } = await supabase
      .from('payments')
      .select('from_member, to_member, amount')
      .eq('group_id', groupId)

    if (paymentsError) {
      setError(paymentsError.message)
      return
    }

    const paymentsForBalances = (paymentsData || []).map((p) => ({
      from_user: p.from_member,
      to_user: p.to_member,
      amount: p.amount,
    }))

    const balances = computeBalances({ bills, items, itemShares, payments: paymentsForBalances })
    // `categories` is already loaded for this page's own category-management
    // UI further down — reused here rather than a second fetch, resolving
    // each item's effective category (its own, falling back to its bill's)
    // down to a name before it's frozen into the snapshot, since a
    // category_id stops meaning anything once this group's data is no
    // longer queryable by the person leaving.
    const categoryNameById = new Map(categories.map((c) => [c.id, c.name]))
    const dailyTotals = computeDailyTotalsForUser(member.id, { bills, items, itemShares, categoryNameById })

    const { error: removeError } = await supabase.rpc('remove_group_member', {
      target_group_id: groupId,
      target_user_id: member.userId,
      group_name: name,
      snapshot_balance: balances[member.id] || 0,
      snapshot_daily: dailyTotals,
    })

    if (removeError) {
      setError(removeError.message)
      return
    }

    if (isSelf) {
      navigate('/')
    } else {
      loadGroup() // admin may have changed if the admin themself just left
      loadMembers()
    }
  }

  const activeRealMembers = members.filter((m) => m.active && !m.isGuest)
  const activeGuests = members.filter((m) => m.active && m.isGuest)
  const formerRealMembers = members.filter((m) => !m.active && !m.isGuest)
  const archivedGuests = members.filter((m) => !m.active && m.isGuest)

  return (
    <div className="page">
      <header className="page-header">
        <Link to={`/groups/${groupId}`} className="btn-link">
          ← Back
        </Link>
        <h1>Group settings</h1>
      </header>

      <h2 className="settings-section-title">Group name</h2>
      <form onSubmit={saveName} className="inline-form">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" />
        <button type="submit" className="btn-primary">
          {saved ? 'Saved!' : 'Save'}
        </button>
      </form>

      <h2 className="settings-section-title">Members ({activeRealMembers.length})</h2>
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
              <span className="member-list-actions">
                {isAdmin && !isThisMemberAdmin && (
                  <button type="button" className="btn-link" onClick={() => makeAdmin(m)}>
                    Make admin
                  </button>
                )}
                {(isSelf || isAdmin) && (
                  <button
                    type="button"
                    className="btn-link dropdown-item-warn"
                    onClick={() => removeRealMember(m)}
                  >
                    {isSelf ? 'Leave' : 'Remove'}
                  </button>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      {!isAdmin && (
        <p className="muted">
          Only the group admin can remove other members — you can still leave any time.
        </p>
      )}

      <h2 className="settings-section-title">Guests ({activeGuests.length})</h2>
      <p className="muted">
        People without an account of their own — add anyone who's splitting a bill but doesn't want to
        sign up. They can be assigned to items and settled up with exactly like anyone else. If one
        of them decides to sign up for real later, "Get claim link" gives you a private link that
        hands them this exact history under their own account — send it directly to them, not to
        the whole group.
      </p>
      {claimStatus && <p className="status-success">{claimStatus}</p>}
      <ul className="member-list">
        {activeGuests.map((m) => (
          <li key={m.id} className="member-list-item">
            {editingGuestId === m.id ? (
              <form
                className="guest-rename-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  saveGuestRename(m.id)
                }}
              >
                <input
                  value={editingGuestName}
                  onChange={(e) => setEditingGuestName(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="btn-link">
                  Save
                </button>
                <button type="button" className="btn-link" onClick={() => setEditingGuestId(null)}>
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <span>
                  {m.name} <span className="muted">(guest)</span>
                </span>
                <span className="member-list-actions">
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => {
                      setEditingGuestId(m.id)
                      setEditingGuestName(m.name)
                    }}
                  >
                    Rename
                  </button>
                  <button type="button" className="btn-link" onClick={() => getClaimLink(m)}>
                    Get claim link
                  </button>
                  <button
                    type="button"
                    className="btn-link dropdown-item-warn"
                    onClick={() => toggleGuestActive(m, false)}
                  >
                    Remove
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={submitAddGuest} className="inline-form">
        <input
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          placeholder="Guest's name"
        />
        <button type="submit" className="btn-primary">
          Add guest
        </button>
      </form>

      <h2 className="settings-section-title">Categories</h2>
      <p className="muted">
        Tag a bill (or an individual item, if it belongs somewhere else) with one of these to see
        how you spend, not just how much, on the group's stats page.
      </p>
      <ul className="member-list">
        {categories.map((cat) => (
          <li key={cat.id} className="member-list-item">
            {editingCategoryId === cat.id ? (
              <form
                className="guest-rename-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  saveCategoryRename(cat.id)
                }}
              >
                <CategoryColorButton
                  color={cat.color}
                  onChangeColor={(color) => handleCategoryColorChange(cat.id, color)}
                />
                <input
                  value={editingCategoryName}
                  onChange={(e) => setEditingCategoryName(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="btn-link">
                  Save
                </button>
                <button type="button" className="btn-link" onClick={() => setEditingCategoryId(null)}>
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <span className="category-label">
                  <CategoryColorButton
                    color={cat.color}
                    onChangeColor={(color) => handleCategoryColorChange(cat.id, color)}
                  />
                  {cat.name}
                </span>
                <span className="member-list-actions">
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => {
                      setEditingCategoryId(cat.id)
                      setEditingCategoryName(cat.name)
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="btn-link dropdown-item-warn"
                    onClick={() => handleDeleteCategory(cat)}
                  >
                    Delete
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={submitAddCategory} className="inline-form category-add-form">
        <input
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          placeholder="New category"
        />
        <ColorSwatchPicker value={newCategoryColor} onChange={setNewCategoryColor} />
        <button type="submit" className="btn-primary">
          Add category
        </button>
      </form>

      <h2 className="settings-section-title">Import data</h2>
      <p className="muted">
        Bring in a group's spending history from another app — realistically a one-time thing, so
        it lives here rather than cluttering the group page itself.
      </p>
      <Link to={`/groups/${groupId}/import`} className="btn-link import-link">
        Import bills from Splitwise (CSV)
      </Link>
      <Link to={`/groups/${groupId}/categorize`} className="btn-link import-link">
        Categorize uncategorized bills
      </Link>

      {formerRealMembers.length > 0 && (
        <>
          <h2 className="settings-section-title">Former members</h2>
          <p className="muted">
            They've left the group, but their bills, items, and payments are still kept — and their own
            stats page keeps a frozen record of what they spent here. If they use the invite link again,
            they'll pick up right where they left off.
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

      {archivedGuests.length > 0 && (
        <>
          <h2 className="settings-section-title">Archived guests</h2>
          <p className="muted">
            Kept on old bills, but won't be offered for new ones. Restore any time — or, if the
            group's admin, delete one permanently instead. That only works once they're not on any
            bill, payment, or recurring template anymore; otherwise it's blocked rather than
            silently leaving something broken behind.
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
                    <button
                      type="button"
                      className="btn-link dropdown-item-warn"
                      onClick={() => setDeleteGuestTarget(m)}
                    >
                      Delete permanently
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {deleteGuestTarget && (
        <TypedConfirmModal
          title="Delete guest permanently"
          body={
            <p>
              This permanently deletes <strong>{deleteGuestTarget.name}</strong> from{' '}
              <strong>{name}</strong> — this can't be undone. Only works if they're not on any
              bill, payment, or recurring template anymore; if they are, this is blocked and says
              so rather than leaving something broken behind.
            </p>
          }
          confirmWord={deleteGuestTarget.name}
          confirmLabel="Delete permanently"
          pending={deletingGuest}
          onConfirm={confirmDeleteGuestPermanently}
          onCancel={() => setDeleteGuestTarget(null)}
        />
      )}

      <h2 className="settings-section-title">Danger zone</h2>
      <p className="muted">
        Permanently deletes every bill in this group, along with their items and payer splits —
        optionally its settle-up (payment) history too, your choice. Members and categories are
        untouched either way. This can't be undone, and only the group admin can do it.
      </p>
      {isAdmin ? (
        <button
          type="button"
          className="btn-danger"
          disabled={!name.trim()}
          onClick={() => setShowDeleteAllModal(true)}
        >
          Delete all bills
        </button>
      ) : (
        <p className="muted">Only the group admin can delete all bills in this group.</p>
      )}
      {showDeleteAllModal && (
        <TypedConfirmModal
          title="Delete all bills"
          body={
            <>
              <p>
                This permanently deletes every bill in <strong>{name}</strong> — all their items
                and payer splits go with them. Members and categories stay untouched. This can't
                be undone.
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
          confirmWord={name}
          confirmLabel="Delete all bills"
          pending={deletingAllBills}
          onConfirm={handleDeleteAllBills}
          onCancel={() => {
            setShowDeleteAllModal(false)
            setDeletePaymentsToo(false)
          }}
        />
      )}

      {error && <p className="status-error">{error}</p>}
    </div>
  )
}
