import { Link } from 'react-router-dom'
import { useCurrency } from '../context/CurrencyContext'
import { SettleIcon, ReceiptIcon } from './icons'

// A real group's "where do I stand" block on the group page: the debts
// that involve you, then Settle up / Record payment / History. Rendered
// only once the server-computed `settlement` has arrived, so an empty
// group never flashes "you're all settled up" before it actually knows.
export default function GroupBalanceSummary({
  groupId,
  settlement,
  members,
  myParticipantId,
  highlightFullBalanceLine,
}) {
  const { format } = useCurrency()
  // Settlement's own from/to are member ids, same as everywhere else this
  // app resolves a name from one.
  const nameOf = (id) => members.find((m) => m.id === id)?.name || 'Someone'
  // The debts that actually involve you, out of the group's full
  // simplified list — everything else lives one tap away on the Settle Up
  // page (see the action row below), not here.
  const myBalanceLines = settlement.filter((t) => t.from === myParticipantId || t.to === myParticipantId)
  // What's owed to you minus what you owe, across every line above. The
  // simplified debts keep each person's net unchanged, so this is the same
  // figure get_group_balances() holds for you; rounded to the cent against
  // float drift from adding amounts.
  const net = Math.round(myBalanceLines.reduce((sum, t) => sum + (t.to === myParticipantId ? t.amount : -t.amount), 0) * 100) / 100
  const netColorClass = net > 0 ? 'balance-positive' : net < 0 ? 'balance-negative' : ''

  return (
    <>
      {/* The balance summary — everything a "how much did you spend"
          question needs at a glance, unlike the full settlement (via the
          Settle Up button) which lists every debt in the group, not just
          yours. */}
      <div className="balance-summary">
        {myBalanceLines.length === 0 ? (
          <p className="muted">You're all settled up in this group.</p>
        ) : (
          <>
          {/* The total across the lines below — same coloring rules as
              they follow, and the direction is spelled out in words so the
              color is never the only cue. */}
          <p className={`balance-line ${highlightFullBalanceLine ? netColorClass : ''}`}>
            {net === 0 ? (
              "Net balance: you're even overall"
            ) : (
              <>
                Net balance: {net > 0 ? "you're owed" : 'you owe'}{' '}
                <span className={`mono ${highlightFullBalanceLine ? '' : netColorClass}`}>{format(Math.abs(net))}</span>
              </>
            )}
          </p>
          {myBalanceLines.map((t, i) => {
            const iOwe = t.from === myParticipantId
            // Settings > Groups' own "Color the whole balance line"
            // toggle — on (the default) colors the whole <p>, which the
            // amount span below then just inherits; off leaves the line
            // in the ordinary text color and puts the same class on the
            // amount alone instead. Either way it's the same two utility
            // classes the rest of the app already colors a balance with
            // (.balance-positive/.balance-negative on a bill row's own
            // "You lent"/"You borrowed") — nothing new invented here.
            const colorClass = iOwe ? 'balance-negative' : 'balance-positive'
            const otherName = iOwe ? nameOf(t.to) : nameOf(t.from)
            return (
              <p key={i} className={`balance-line ${highlightFullBalanceLine ? colorClass : ''}`}>
                {iOwe ? (
                  <>
                    You owe <strong>{otherName}</strong>{' '}
                    <span className={`mono ${highlightFullBalanceLine ? '' : colorClass}`}>{format(t.amount)}</span>
                  </>
                ) : (
                  <>
                    <strong>{otherName}</strong> owes You{' '}
                    <span className={`mono ${highlightFullBalanceLine ? '' : colorClass}`}>{format(t.amount)}</span>
                  </>
                )}
              </p>
            )
          })}
          </>
        )}
      </div>
      {/* Settle up is deliberately the loud one here (.btn-primary, its own
          icon) — it's the action that actually resolves something; Record
          a payment and History are both just navigation to their own pages
          (RecordPayment.jsx/History.jsx), plain .btn-secondary like any
          other secondary action in this app. */}
      <div className="settle-actions">
        <Link to={`/groups/${groupId}/settle-up`} className="btn-primary btn-with-icon">
          <SettleIcon size={16} />
          Settle up
        </Link>
        <Link to={`/groups/${groupId}/record-payment`} className="btn-secondary">
          Record payment
        </Link>
        <Link to={`/groups/${groupId}/history`} className="btn-secondary btn-with-icon">
          <ReceiptIcon size={16} />
          History
        </Link>
      </div>
    </>
  )
}
