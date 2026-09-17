import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../context/CurrencyContext'
import { fetchAllGroupMembers } from '../lib/members'
import { fetchAllRows } from '../lib/fetchAllRows'
import { loadErrorMessage } from '../lib/loadErrorMessage'
import { groupViewCache } from '../lib/groupViewCache'
import { GROUP_BILLS_SELECT, computeGroupViewSnapshot } from '../lib/groupViewSnapshot'
import BackButton from '../components/BackButton'

// Every debt in the group, full stop — GroupView.jsx's own balance summary
// (right under the title) only ever shows the lines that involve you; this
// is the "no, really, everything" page that button opens, replacing the
// "Settle up" list that used to live inline on the group page itself (now
// redundant with that summary). Yours come first, unmissable; everyone
// else's sit collapsed underneath — still visible and still settleable
// (point 5 in this round's brief: any member can register any payment, on
// the honor system, same as this app already trusted the Record-a-payment
// form on the group page to do), just not competing for attention with the
// debts that are actually yours.
export default function SettleUp() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const { format } = useCurrency()

  // Seeded from the same cache GroupView.jsx itself paints from on a
  // revisit — a real group is essentially never opened without going
  // through that page first, so there's almost always something here
  // already; load() below always runs anyway, so a stale seed is never
  // shown for longer than one fetch.
  const cached = groupViewCache.get(groupId)
  const [group, setGroup] = useState(cached?.group ?? null)
  const [allMembers, setAllMembers] = useState(cached?.allMembers ?? [])
  const [settlement, setSettlement] = useState(cached?.settlement ?? null)
  const [error, setError] = useState(null)

  const nameOf = (id) => allMembers.find((m) => m.id === id)?.name || 'Someone'
  const myParticipantId = allMembers.find((m) => m.userId === user.id)?.id

  const loadGroup = useCallback(async () => {
    const { data, error: groupError } = await supabase.from('groups').select('*').eq('id', groupId).single()
    if (groupError) {
      setError(`Couldn't load this group: ${loadErrorMessage(groupError)}`)
      return
    }
    setGroup(data)
  }, [groupId])

  // Bills + payments in, one simplified debt list out — same derivation
  // GroupView.jsx's own settlement uses (groupViewSnapshot.js), so the two
  // pages can never quietly disagree about who owes whom. Members are
  // fetched alongside rather than left to the cached seed alone, since
  // Mark paid below can be the very first thing that adds someone new to
  // this group's balance.
  const load = useCallback(async () => {
    try {
      const [membersData, billsData, paymentsData] = await Promise.all([
        fetchAllGroupMembers(groupId),
        fetchAllRows(() =>
          supabase
            .from('bills')
            .select(GROUP_BILLS_SELECT, { count: 'exact' })
            .eq('group_id', groupId)
            .order('created_at', { ascending: false })
        ),
        fetchAllRows(() =>
          supabase
            .from('payments')
            .select('id, from_member, to_member, amount, created_at', { count: 'exact' })
            .eq('group_id', groupId)
            .order('created_at', { ascending: false })
        ),
      ])
      setAllMembers(membersData)
      setSettlement(computeGroupViewSnapshot(billsData, paymentsData).settlement)
      setError(null)
    } catch (err) {
      setError(`Couldn't load balances: ${loadErrorMessage(err)}`)
    }
  }, [groupId])

  useEffect(() => {
    loadGroup()
    load()

    // Mirrors GroupView.jsx's own realtime subscription, scoped to just
    // what this page actually shows — any bill/item/share/payment change
    // can shift the simplified debt list, and a member change can rename
    // who a row's talking about. Filtered to this group the same way
    // GroupView.jsx's own does; see that file's identical comment for why
    // items/item_shares stay unfiltered.
    const groupFilter = `group_id=eq.${groupId}`
    const channel = supabase
      .channel(`settle-up-${groupId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills', filter: groupFilter }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_shares' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: groupFilter }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: groupFilter }, load)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [groupId, loadGroup, load])

  // Recording a payment settles it the same way GroupView.jsx's own
  // Record-a-payment form does (a plain insert — the RLS policy is what
  // actually decides who's allowed to, not this button), for either your
  // own debts or someone else's "Other debts" row. No confirm step: same
  // as marking a debt paid always has been in this app, and undoing it is
  // one tap away in the group page's own Payment history.
  async function markPaid(fromMemberId, toMemberId, amount) {
    setError(null)
    const { error: paymentError } = await supabase.from('payments').insert({
      group_id: groupId,
      from_member: fromMemberId,
      to_member: toMemberId,
      amount,
      created_by: user.id,
    })
    if (paymentError) {
      setError(paymentError.message)
      return
    }
    load()
  }

  const mine = (settlement || []).filter((t) => t.from === myParticipantId || t.to === myParticipantId)
  const others = (settlement || []).filter((t) => t.from !== myParticipantId && t.to !== myParticipantId)

  return (
    <div className="page">
      <header className="page-header">
        <BackButton to={`/groups/${groupId}`} label={group?.name || 'Group'} />
        <h1>Settle up</h1>
      </header>

      {error && <p className="status-error">{error}</p>}

      {settlement === null ? (
        <p className="muted">Loading…</p>
      ) : settlement.length === 0 ? (
        <p className="empty-state">Everyone's even — nothing to settle.</p>
      ) : (
        <>
          {mine.length > 0 ? (
            <ul className="settlement-list settle-your-debts">
              {mine.map((t, i) => {
                const iOwe = t.from === myParticipantId
                return (
                  <li key={i}>
                    <span className="debtor">{iOwe ? 'You' : nameOf(t.from)}</span>
                    <span className="settlement-verb">{iOwe ? 'owe' : 'owes'}</span>
                    <span className="creditor">{iOwe ? nameOf(t.to) : 'You'}</span>
                    <span className="settlement-action">
                      <span className="mono amount">{format(t.amount)}</span>
                      <button
                        type="button"
                        className="btn-secondary mark-paid-btn"
                        onClick={() => markPaid(t.from, t.to, t.amount)}
                      >
                        Mark paid
                      </button>
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="muted settle-your-debts">You're all settled up in this group.</p>
          )}

          {others.length > 0 && (
            <details className="other-debts">
              <summary>
                Other debts in this group ({others.length})
              </summary>
              <ul className="settlement-list">
                {others.map((t, i) => (
                  <li key={i}>
                    <span className="debtor">{nameOf(t.from)}</span>
                    <span className="settlement-verb">owes</span>
                    <span className="creditor">{nameOf(t.to)}</span>
                    <span className="settlement-action">
                      <span className="mono amount">{format(t.amount)}</span>
                      <button
                        type="button"
                        className="btn-secondary mark-paid-btn"
                        onClick={() => markPaid(t.from, t.to, t.amount)}
                      >
                        Mark paid
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}
