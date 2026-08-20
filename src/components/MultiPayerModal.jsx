import { useState } from 'react'
import { parseNumber } from '../lib/parseNumber'
import { useCurrency } from '../context/CurrencyContext'

// Pulled out from the component so it's testable without a browser/React —
// this is the one bit of actual logic in an otherwise plain form.
export function validatePayerDraft(draft, billTotal) {
  const enteredTotal = Object.values(draft).reduce((sum, v) => sum + (parseNumber(v) || 0), 0)
  const roundedEntered = Math.round(enteredTotal * 100) / 100
  const roundedBillTotal = Math.round(Number(billTotal) * 100) / 100
  const hasAnyPayer = Object.keys(draft).length > 0
  const sumsMatch = Math.abs(roundedEntered - roundedBillTotal) < 0.01
  return { roundedEntered, roundedBillTotal, hasAnyPayer, sumsMatch, isValid: hasAnyPayer && sumsMatch }
}

// Everything here is draft state, local to this component — nothing is
// written to the database until Confirm is clicked and passes validation.
// Canceling (or clicking the backdrop) just unmounts this component with
// its draft discarded; the bill's actual saved payer split is completely
// untouched either way.
export default function MultiPayerModal({ members, billTotal, currentPayers, onConfirm, onCancel }) {
  const { format } = useCurrency()
  const [draft, setDraft] = useState(() => {
    const map = {}
    for (const p of currentPayers) map[p.member_id] = String(p.amount)
    return map
  })

  function toggle(memberId) {
    setDraft((d) => {
      const next = { ...d }
      if (memberId in next) delete next[memberId]
      else next[memberId] = ''
      return next
    })
  }

  function setAmount(memberId, value) {
    setDraft((d) => ({ ...d, [memberId]: value }))
  }

  const { roundedEntered, roundedBillTotal, hasAnyPayer, sumsMatch, isValid } = validatePayerDraft(draft, billTotal)

  function handleConfirm() {
    if (!isValid) return
    onConfirm(Object.entries(draft).map(([member_id, amount]) => ({ member_id, amount: parseNumber(amount) || 0 })))
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <h2>Multiple payers</h2>
        {members.map((m) => (
          <label key={m.id} className="payer-row">
            <input type="checkbox" checked={m.id in draft} onChange={() => toggle(m.id)} />
            <span>{m.name}</span>
            <input
              type="text"
              inputMode="decimal"
              disabled={!(m.id in draft)}
              value={draft[m.id] ?? ''}
              onChange={(e) => setAmount(m.id, e.target.value)}
              placeholder="0.00"
            />
          </label>
        ))}

        <p className="payer-total-row">
          Entered: <span className="mono">{format(roundedEntered)}</span> / Bill total:{' '}
          <span className="mono">{format(roundedBillTotal)}</span>
        </p>
        {!hasAnyPayer && <p className="status-error">Select at least one payer.</p>}
        {hasAnyPayer && !sumsMatch && (
          <p className="status-error">These amounts need to add up to exactly the bill total.</p>
        )}

        <div className="modal-actions">
          <button type="button" className="btn-link" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={!isValid} onClick={handleConfirm}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
