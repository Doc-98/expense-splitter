import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../context/CurrencyContext'
import { fetchAllGroupMembers } from '../lib/members'
import { fetchAllRows } from '../lib/fetchAllRows'
import { loadErrorMessage } from '../lib/loadErrorMessage'
import { groupItemsByDate } from '../lib/dateGroups'
import { useSwipeToDelete } from '../lib/useSwipeToDelete'
import BackButton from '../components/BackButton'
import Pagination from '../components/Pagination'

const PAGE_SIZE = 15

// Every payment ever recorded in the group, its own page now instead of a
// collapsed <details> at the bottom of the group page — reuses the bill
// list's own card + swipe-to-delete + month/day-divider shape (GroupView.jsx)
// rather than inventing a second list style, but stays clearly its own
// thing by content, not chrome: no ⋮ menu (there's nothing here to select,
// share, or rename), and the status line under the amount says "You paid"/
// "You received" — the same balance-positive/negative colors a bill row's
// "You lent"/"You borrowed" already uses — instead of a bill's own note.
export default function History() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const { format } = useCurrency()

  const [group, setGroup] = useState(null)
  const [allMembers, setAllMembers] = useState([])
  const [payments, setPayments] = useState(null) // null = still loading
  const [page, setPage] = useState(0)
  const [error, setError] = useState(null)

  const myParticipantId = allMembers.find((m) => m.userId === user.id)?.id
  const nameOf = (id) => allMembers.find((m) => m.id === id)?.name || 'Someone'

  const loadGroup = useCallback(async () => {
    const { data, error: groupError } = await supabase.from('groups').select('*').eq('id', groupId).single()
    if (groupError) {
      setError(`Couldn't load this group: ${loadErrorMessage(groupError)}`)
      return
    }
    setGroup(data)
  }, [groupId])

  const loadMembers = useCallback(async () => {
    try {
      setAllMembers(await fetchAllGroupMembers(groupId))
    } catch (err) {
      setError(`Couldn't load this group's members: ${loadErrorMessage(err)}`)
    }
  }, [groupId])

  const loadPayments = useCallback(async () => {
    try {
      const data = await fetchAllRows(() =>
        supabase
          .from('payments')
          .select('id, from_member, to_member, amount, created_at', { count: 'exact' })
          .eq('group_id', groupId)
          .order('created_at', { ascending: false })
      )
      setPayments(data)
      setError(null)
    } catch (err) {
      setError(`Couldn't load payment history: ${loadErrorMessage(err)}`)
    }
  }, [groupId])

  useEffect(() => {
    loadGroup()
    loadMembers()
    loadPayments()

    const groupFilter = `group_id=eq.${groupId}`
    const channel = supabase
      .channel(`history-${groupId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: groupFilter }, loadPayments)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: groupFilter }, loadMembers)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [groupId, loadGroup, loadMembers, loadPayments])

  // Clamp same as the bill list's own — deleting enough payments off the
  // last page (or an Undo right at the boundary) can otherwise leave `page`
  // pointing past the new last page.
  useEffect(() => {
    if (!payments) return
    const maxPage = Math.max(0, Math.ceil(payments.length / PAGE_SIZE) - 1)
    if (page > maxPage) setPage(maxPage)
  }, [payments, page])

  // Same confirm-before-delete GroupView.jsx's own deletePayment always
  // had — the swipe-then-tap reveal is the "are you sure enough to even
  // reach for the button" step, not a replacement for actually asking.
  async function undoPayment(payment) {
    if (!window.confirm('Undo this payment?')) return
    setError(null)
    const { error: deleteError } = await supabase.from('payments').delete().eq('id', payment.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    loadPayments()
  }

  const { bind: bindSwipe } = useSwipeToDelete()

  const visiblePayments = (payments || []).slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const dayGroups = groupItemsByDate(visiblePayments)

  return (
    <div className="page">
      <header className="page-header">
        <BackButton to={`/groups/${groupId}`} label={group?.name || 'Group'} />
        <h1>History</h1>
      </header>

      {error && <p className="status-error">{error}</p>}

      {payments === null ? (
        <p className="muted">Loading…</p>
      ) : payments.length === 0 ? (
        <p className="empty-state">No payments recorded yet.</p>
      ) : (
        <div className="bill-groups">
          {dayGroups.map((monthGroup) => (
            <div key={monthGroup.key} className="bill-month-group">
              <h3 className="bill-month-divider">{monthGroup.label}</h3>
              {monthGroup.days.map((dayGroup) => (
                <div key={dayGroup.key}>
                  <div className="bill-day-divider">{dayGroup.label}</div>
                  <ul className="card-list">
                    {dayGroup.items.map((payment) => {
                      const iPaid = payment.from_member === myParticipantId
                      const iReceived = payment.to_member === myParticipantId
                      const title = iPaid
                        ? nameOf(payment.to_member)
                        : iReceived
                          ? nameOf(payment.from_member)
                          : `${nameOf(payment.from_member)} → ${nameOf(payment.to_member)}`
                      const swipe = bindSwipe(payment.id, () => undoPayment(payment))
                      return (
                        <li key={payment.id} className="bill-list-item">
                          <div className="bill-row-outer">
                            <div className="bill-row-shell">
                              <button type="button" className="item-row-delete-action" {...swipe.deleteButton}>
                                Undo
                              </button>
                              <div className="card-list-item" {...swipe.row}>
                                <span className="card-list-item-main">
                                  <span className="card-list-item-title">{title}</span>
                                </span>
                                <span className="bill-row-right">
                                  <span className="bill-amount-block">
                                    <span className="mono bill-amount-total">{format(payment.amount)}</span>
                                    {iPaid && (
                                      <span className="bill-amount-status balance-negative">You paid</span>
                                    )}
                                    {iReceived && (
                                      <span className="bill-amount-status balance-positive">You received</span>
                                    )}
                                  </span>
                                </span>
                              </div>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} setPage={setPage} totalItems={(payments || []).length} pageSize={PAGE_SIZE} />
    </div>
  )
}
