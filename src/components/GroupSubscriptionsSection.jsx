import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useClickOutside } from '../lib/useClickOutside'
import {
  addRecurringBill,
  updateRecurringBill,
  setRecurringBillActive,
  deleteRecurringBill,
  countRecurringBillOccurrences,
} from '../lib/recurringBills'
import { fetchGroupSubscriptionsData } from '../lib/prefetchGroupSettings'
import { groupSubscriptionsCache } from '../lib/groupSubscriptionsCache'
import { useCurrency } from '../context/CurrencyContext'
import { parseNumber } from '../lib/parseNumber'

const FREQUENCY_LABELS = { weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' }

// "Subscription" is user-facing terminology only — the database table
// (recurring_bills), lib/recurringBills.js, and every function it exports
// keep their original names throughout this file. Same reasoning as
// "Spending thresholds" becoming "Budgets" everywhere it's actually
// shown: renaming the schema/module too would cost a real migration and a
// much wider rename for zero visible benefit.

// The "⋮" per-row menu — same shape as GroupRowMenu/BillActionsMenu
// elsewhere in the app, just with three items. Kept local to this file
// rather than its own component, same reasoning as those: only ever used
// here.
function TemplateMenu({ template, onEdit, onTogglePause, onDelete }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  useClickOutside(wrapRef, () => setOpen(false), open)

  function run(action) {
    setOpen(false)
    action()
  }

  return (
    <div className="row-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className="row-menu-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Actions for ${template.title}`}
      >
        ⋮
      </button>
      {open && (
        <div className="row-menu-popover">
          <button type="button" className="dropdown-item" onClick={() => run(() => onEdit(template))}>
            Edit
          </button>
          <button type="button" className="dropdown-item" onClick={() => run(() => onTogglePause(template))}>
            {template.active ? 'Pause' : 'Resume'}
          </button>
          <button type="button" className="dropdown-item dropdown-item-warn" onClick={() => run(() => onDelete(template))}>
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

function todayInputValue() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function GroupSubscriptionsSection() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const { format } = useCurrency()

  // Seeded straight from groupSubscriptionsCache when there's anything
  // there — either a prefetch fired the instant the group page's own
  // Settings (gear) icon was clicked (see prefetchGroupSettings.js/
  // GroupView.jsx) or a previous visit this session. Deliberately its own
  // cache, not shared with groupRosterCache — see groupSubscriptionsCache.js
  // for why.
  const cached = groupSubscriptionsCache.get(groupId)
  const [members, setMembers] = useState(cached?.members ?? [])
  const [categories, setCategories] = useState(cached?.categories ?? [])
  const [templates, setTemplates] = useState(cached?.templates ?? [])
  const [isPersonal, setIsPersonal] = useState(cached?.isPersonal ?? false)
  const [error, setError] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null) // { template, count, total } | null
  const [deleting, setDeleting] = useState(false)

  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [paidBy, setPaidBy] = useState('')
  const [splitMemberIds, setSplitMemberIds] = useState([])
  const [frequency, setFrequency] = useState('monthly')
  const [startDate, setStartDate] = useState(todayInputValue())
  // The template currently being edited (its id), or null while the form
  // below is in its normal "add a new one" mode — the exact same fields
  // double as the edit form, just pre-filled and branching to
  // updateRecurringBill instead of addRecurringBill on submit (see
  // submitForm). Frequency/startDate aren't part of either state above
  // that edit mode touches — see updateRecurringBill's own comment for why.
  const [editingId, setEditingId] = useState(null)
  const formRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const data = await fetchGroupSubscriptionsData(groupId)
      setMembers(data.members)
      setCategories(data.categories)
      setTemplates(data.templates)
      setIsPersonal(data.isPersonal)
      groupSubscriptionsCache.set(groupId, data)
    } catch (err) {
      setError(err.message)
    }
  }, [groupId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    // Default a brand new subscription to splitting with everyone
    // currently active, same default every other "who splits this"
    // control in the app uses — adjustable per-subscription afterward.
    if (members.length > 0 && splitMemberIds.length === 0) {
      setSplitMemberIds(members.map((m) => m.id))
      setPaidBy((p) => p || members[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members])

  function toggleSplitMember(memberId) {
    setSplitMemberIds((ids) => (ids.includes(memberId) ? ids.filter((id) => id !== memberId) : [...ids, memberId]))
  }

  // Real gate on whether submitting would actually do anything — title and
  // a genuinely positive amount always matter; the split-members check only
  // applies to a real group (a personal space has nobody to split with, and
  // hides that whole section). Category isn't checked separately: its
  // select always holds a value (blank = "Uncategorized", a deliberate
  // choice, not a placeholder), so it's already satisfied no matter what.
  const canSubmit = Boolean(title.trim()) && parseNumber(amount) > 0 && (isPersonal || splitMemberIds.length > 0)

  function resetToBlank() {
    setTitle('')
    setAmount('')
    setCategoryId('')
    setPaidBy(members[0]?.id || '')
    setSplitMemberIds(members.map((m) => m.id))
  }

  function startEdit(template) {
    setEditingId(template.id)
    setTitle(template.title)
    setAmount(String(template.amount))
    setCategoryId(template.category_id || '')
    setPaidBy(template.paid_by || '')
    setSplitMemberIds(template.split_member_ids || [])
    setError(null)
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function cancelEdit() {
    setEditingId(null)
    resetToBlank()
  }

  async function submitForm(e) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    try {
      if (editingId) {
        await updateRecurringBill(supabase, editingId, {
          title: title.trim(),
          amount: parseNumber(amount) || 0,
          categoryId: categoryId || null,
          paidBy: paidBy || null,
          splitMemberIds,
        })
        setEditingId(null)
        resetToBlank()
      } else {
        await addRecurringBill(supabase, groupId, user.id, {
          title: title.trim(),
          amount: parseNumber(amount) || 0,
          categoryId: categoryId || null,
          paidBy: paidBy || null,
          splitMemberIds,
          frequency,
          startDate: new Date(`${startDate}T00:00:00`),
        })
        // Category/paidBy/split deliberately left as they are, not reset —
        // adding several similar subscriptions in a row (e.g. multiple
        // bills split the same way) shouldn't mean re-picking those every
        // time.
        setTitle('')
        setAmount('')
      }
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function togglePause(template) {
    setError(null)
    try {
      await setRecurringBillActive(supabase, template.id, !template.active)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function openDeleteConfirm(template) {
    setError(null)
    try {
      const { count, total } = await countRecurringBillOccurrences(supabase, template.id)
      setDeleteTarget({ template, count, total })
    } catch (err) {
      setError(err.message)
    }
  }

  async function confirmDelete(deleteOccurrences) {
    if (!deleteTarget) return
    setDeleting(true)
    setError(null)
    try {
      await deleteRecurringBill(supabase, deleteTarget.template.id, deleteOccurrences)
      // Deleting the subscription you're mid-edit on would otherwise leave
      // the form silently pointed at an id that no longer exists.
      if (deleteTarget.template.id === editingId) cancelEdit()
      setDeleteTarget(null)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  const nameOf = (id) => members.find((m) => m.id === id)?.name || 'Someone'
  const categoryNameOf = (id) => categories.find((c) => c.id === id)?.name

  return (
    <>
      <h2 className="settings-section-title">Subscriptions</h2>
      <p className="muted">
        A template for something that repeats — rent, a subscription, a utility bill. The next
        occurrence is created automatically the next time anyone opens this group on or after its
        due date; a group that's been quiet for a while catches up on everything it missed, in
        order, rather than skipping ahead.
      </p>

      {error && <p className="status-error">{error}</p>}

      {templates.length > 0 && (
        <ul className="member-list">
          {templates.map((t) => (
            <li
              key={t.id}
              className={`member-list-item ${t.active ? '' : 'former'} ${t.id === editingId ? 'row-editing' : ''}`}
            >
              <span className="category-label">
                {categoryNameOf(t.category_id) && (
                  <span
                    className="category-dot"
                    style={{ background: categories.find((c) => c.id === t.category_id)?.color }}
                  />
                )}
                <strong>{t.title}</strong>
                <span className="muted">
                  {' '}
                  — {format(t.amount)}
                  {!isPersonal && <> · paid by {nameOf(t.paid_by)}</>} · {FREQUENCY_LABELS[t.frequency]} · next{' '}
                  {new Date(`${t.next_due_date}T00:00:00`).toLocaleDateString()}
                  {!t.active && ' · paused'}
                </span>
              </span>
              <TemplateMenu template={t} onEdit={startEdit} onTogglePause={togglePause} onDelete={openDeleteConfirm} />
            </li>
          ))}
        </ul>
      )}

      <h2 className="settings-section-title">{editingId ? 'Edit subscription' : 'New subscription'}</h2>
      <form onSubmit={submitForm} className="stacked-form" ref={formRef}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Rent)" />
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" inputMode="decimal" />

        <div className="stacked-form-row">
          <label className="muted">
            Category
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {!isPersonal && (
            <label className="muted">
              Paid by
              <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {editingId ? (
          <p className="muted">
            Frequency and start date can't be changed here — delete this subscription and set up a
            new one if the schedule itself needs to change.
          </p>
        ) : (
          <div className="stacked-form-row">
            <label className="muted">
              Repeats
              <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
            <label className="muted">
              Starting
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
          </div>
        )}

        {!isPersonal && (
          <>
            <span className="muted">Split with:</span>
            <div className="chip-row">
              {members.map((m) => (
                <label key={m.id} className={splitMemberIds.includes(m.id) ? 'buyer-chip active' : 'buyer-chip'}>
                  <input type="checkbox" checked={splitMemberIds.includes(m.id)} onChange={() => toggleSplitMember(m.id)} />
                  {m.name}
                </label>
              ))}
            </div>
          </>
        )}

        <div className="stacked-form-actions">
          <button type="submit" className="btn-primary form-submit-btn" disabled={!canSubmit}>
            {editingId ? 'Save changes' : 'Add subscription'}
          </button>
          {/* Stands in for the button while it's faded out — same fields
              gate both, so this only ever shows exactly when the button
              itself isn't there to explain its own absence. */}
          {!canSubmit && <span className="form-submit-hint">Fill in a title and an amount to continue</span>}
          {editingId && (
            <button type="button" className="btn-link" onClick={cancelEdit}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h2>Delete "{deleteTarget.template.title}"?</h2>
            {deleteTarget.count > 0 ? (
              <p>
                This subscription has already created {deleteTarget.count}{' '}
                {deleteTarget.count === 1 ? 'bill' : 'bills'} (totaling {format(deleteTarget.total)}). Deleting just
                the subscription leaves those bills exactly as they are — pick "Delete the bills too" only if this
                subscription was a mistake you want undone entirely, not kept.
              </p>
            ) : (
              <p>This subscription hasn't created any bills yet.</p>
            )}
            <div className="modal-actions">
              <button type="button" className="btn-link" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Cancel
              </button>
              <button type="button" className="btn-secondary" onClick={() => confirmDelete(false)} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Keep the bills'}
              </button>
              {deleteTarget.count > 0 && (
                <button type="button" className="btn-danger" onClick={() => confirmDelete(true)} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Delete the bills too'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
