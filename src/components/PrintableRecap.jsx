// Rendered invisibly on screen, shown only in print (see the .print-only /
// @media print rules in styles.css) — clicking "Download PDF" just calls
// window.print(), and the person picks "Save as PDF" in their browser's own
// print dialog. No new dependency, works identically on every phone and
// desktop, at the cost of going through that dialog instead of a single-tap
// file download.

export function PrintableBillRecap({ bill, items, members }) {
  const nameOf = (id) => members.find((m) => m.id === id)?.name || 'Someone'
  const total = items.reduce((sum, it) => sum + Number(it.total_price), 0)

  return (
    <div className="print-only">
      <h1>{bill?.title}</h1>
      {bill?.paid_by && <p>Paid by {nameOf(bill.paid_by)}</p>}
      {bill?.note && <p className="print-note">{bill.note}</p>}
      <table className="print-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Split with</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                {item.name}
                {Number(item.quantity) > 1 ? ` ×${item.quantity}` : ''}
              </td>
              <td>{(item.item_shares || []).map((s) => nameOf(s.member_id)).join(', ') || 'Unassigned'}</td>
              <td>€{Number(item.total_price).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="print-total">Total: €{total.toFixed(2)}</p>
      <p className="print-footer">Generated {new Date().toLocaleDateString()}</p>
    </div>
  )
}

export function PrintableSettlementRecap({ groupName, transactions, members }) {
  const nameOf = (id) => members.find((m) => m.id === id)?.name || 'Someone'

  return (
    <div className="print-only">
      <h1>Settle up — {groupName}</h1>
      {!transactions || transactions.length === 0 ? (
        <p>Everyone's even — nothing to settle.</p>
      ) : (
        <table className="print-table">
          <thead>
            <tr>
              <th>From</th>
              <th>To</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t, i) => (
              <tr key={i}>
                <td>{nameOf(t.from)}</td>
                <td>{nameOf(t.to)}</td>
                <td>€{t.amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="print-footer">Generated {new Date().toLocaleDateString()}</p>
    </div>
  )
}
