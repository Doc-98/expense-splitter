import { useState } from 'react'
import { parseNumber } from '../lib/parseNumber'
import { useCurrency } from '../context/CurrencyContext'

function RecordPaymentForm({ members, onRecordPayment }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')

  function submit(e) {
    e.preventDefault()
    const amt = parseNumber(amount)
    if (!from || !to || from === to || !amt) return
    onRecordPayment(from, to, amt)
    setAmount('')
  }

  return (
    <form onSubmit={submit} className="payment-form">
      <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Who paid">
        <option value="">Who paid…</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
            {m.isGuest ? ' (guest)' : ''}
          </option>
        ))}
      </select>
      <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Who received it">
        <option value="">Paid to…</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
            {m.isGuest ? ' (guest)' : ''}
          </option>
        ))}
      </select>
      <input
        placeholder="Amount"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <button type="submit" className="btn-secondary">
        Record
      </button>
    </form>
  )
}

export default function SettlementSummary({ transactions, members, payments, onRecordPayment, onDeletePayment }) {
  const { format } = useCurrency()
  const nameOf = (id) => members?.find((m) => m.id === id)?.name || 'Someone'

  if (!transactions) return null

  return (
    <div className="settlement">
      <h2>Settle up</h2>
      {transactions.length === 0 ? (
        <p className="empty-state">Everyone's even — nothing to settle.</p>
      ) : (
        <ul className="settlement-list">
          {transactions.map((t, i) => (
            <li key={i}>
              <span className="debtor">{nameOf(t.from)}</span>
              <span className="settlement-verb">owes</span>
              <span className="creditor">{nameOf(t.to)}</span>
              <span className="settlement-action">
                <span className="mono amount">{format(t.amount)}</span>
                <button
                  type="button"
                  className="btn-secondary mark-paid-btn"
                  onClick={() => onRecordPayment(t.from, t.to, t.amount)}
                >
                  Mark paid
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="payment-form-title">Record a payment</h3>
      <RecordPaymentForm members={members || []} onRecordPayment={onRecordPayment} />

      {payments?.length > 0 && (
        <details className="payment-history">
          <summary>Payment history ({payments.length})</summary>
          <ul className="settlement-list">
            {payments.map((p) => (
              <li key={p.id}>
                <span className="debtor">{nameOf(p.from_member)}</span>
                <span className="settlement-verb">paid</span>
                <span className="creditor">{nameOf(p.to_member)}</span>
                <span className="settlement-action">
                  <span className="mono amount">{format(p.amount)}</span>
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => onDeletePayment(p.id)}
                    aria-label="Undo this payment"
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
