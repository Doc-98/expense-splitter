export default function SettlementSummary({ transactions, members }) {
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
              <span className="mono amount">€{t.amount.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
