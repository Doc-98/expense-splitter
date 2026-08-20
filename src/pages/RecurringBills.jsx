import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { fetchGroupMembers } from '../lib/members'
import { fetchCategories } from '../lib/categories'
import {
  fetchRecurringBills,
  addRecurringBill,
  setRecurringBillActive,
  deleteRecurringBill,
} from '../lib/recurringBills'
import { useCurrency } from '../context/CurrencyContext'
import { parseNumber } from '../lib/parseNumber'

const FREQUENCY_LABELS = { weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' }

function todayInputValue() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function RecurringBills() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const { format } = useCurrency()

  const [members, setMembers] = useState([])
  const [categories, setCategories] = useState([])
  const [templates, setTemplates] = useState([])
  const [error, setError] = useState(null)

  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [paidBy, setPaidBy] = useState('')
  const [splitMemberIds, setSplitMemberIds] = useState([])
  const [frequency, setFrequency] = useState('monthly')
  const [startDate, setStartDate] = useState(todayInputValue())

  const load = useCallback(async () => {
    setMembers(await fetchGroupMembers(groupId))
    setCategories(await fetchCategories(groupId))
    setTemplates(await fetchRecurringBills(supabase, groupId))
  }, [groupId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    // Default a brand new template to splitting with everyone currently
    // active, same default every other "who splits this" control in the
    // app uses — adjustable per-template afterward.
    if (members.length > 0 && splitMemberIds.length === 0) {
      setSplitMemberIds(members.map((m) => m.id))
      setPaidBy((p) => p || members[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members])

  function toggleSplitMember(memberId) {
    setSplitMemberIds((ids) => (ids.includes(memberId) ? ids.filter((id) => id !== memberId) : [...ids, memberId]))
  }

  async function submitAdd(e) {
    e.preventDefault()
    if (!title.trim() || !amount || splitMemberIds.length === 0) return
    setError(null)
    try {
      await addRecurringBill(supabase, groupId, user.id, {
        title: title.trim(),
        amount: parseNumber(amount) || 0,
        categoryId: categoryId || null,
        paidBy: paidBy || null,
        splitMemberIds,
        frequency,
        startDate: new Date(`${startDate}T00:00:00`),
      })
      setTitle('')
      setAmount('')
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

  async function handleDelete(template) {
    if (!window.confirm(`Delete the recurring "${template.title}"? Bills already created from it are kept.`)) return
    setError(null)
    try {
      await deleteRecurringBill(supabase, template.id)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  const nameOf = (id) => members.find((m) => m.id === id)?.name || 'Someone'
  const categoryNameOf = (id) => categories.find((c) => c.id === id)?.name

  return (
    <div className="page">
      <header className="page-header">
        <Link to={`/groups/${groupId}`} className="btn-link">
          ← Back
        </Link>
        <h1>Recurring bills</h1>
      </header>

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
            <li key={t.id} className={`member-list-item ${t.active ? '' : 'former'}`}>
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
                  — {format(t.amount)} · paid by {nameOf(t.paid_by)} · {FREQUENCY_LABELS[t.frequency]} · next{' '}
                  {new Date(`${t.next_due_date}T00:00:00`).toLocaleDateString()}
                  {!t.active && ' · paused'}
                </span>
              </span>
              <span className="member-list-actions">
                <button type="button" className="btn-link" onClick={() => togglePause(t)}>
                  {t.active ? 'Pause' : 'Resume'}
                </button>
                <button type="button" className="btn-link dropdown-item-warn" onClick={() => handleDelete(t)}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="settings-section-title">New recurring bill</h2>
      <form onSubmit={submitAdd} className="recurring-form">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Rent)" />
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          inputMode="decimal"
        />

        <div className="recurring-form-row">
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
        </div>

        <div className="recurring-form-row">
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

        <span className="muted">Split with:</span>
        <div className="chip-row">
          {members.map((m) => (
            <label key={m.id} className={splitMemberIds.includes(m.id) ? 'buyer-chip active' : 'buyer-chip'}>
              <input
                type="checkbox"
                checked={splitMemberIds.includes(m.id)}
                onChange={() => toggleSplitMember(m.id)}
              />
              {m.name}
            </label>
          ))}
        </div>

        <button type="submit" className="btn-primary">
          Add recurring bill
        </button>
      </form>
    </div>
  )
}
