// Rendered via PrintPortal (see that component) into #print-root, kept
// out of the normal page flow and hidden on screen — only shown by the
// print stylesheet (@media print in styles.css) once "Download as PDF"
// calls window.print() and the person picks "Save as PDF" in their
// browser's own print dialog. No new dependency, works identically on
// every phone and desktop, at the cost of going through that dialog
// instead of a single-tap file download.
import { useCurrency } from '../context/CurrencyContext'
import PrintPortal from './PrintPortal'

export function PrintableBillRecap({ bill, items, members }) {
  const { format } = useCurrency()
  const nameOf = (id) => members.find((m) => m.id === id)?.name || 'Someone'
  const total = items.reduce((sum, it) => sum + Number(it.total_price), 0)

  return (
    <PrintPortal>
      <div className="print-only">
        <h1>{bill?.title}</h1>
        {bill?.payers?.length > 0 ? (
          <p>Paid by {bill.payers.map((p) => `${nameOf(p.member_id)} (${format(p.amount)})`).join(', ')}</p>
        ) : (
          bill?.paid_by && <p>Paid by {nameOf(bill.paid_by)}</p>
        )}
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
                <td className="mono">{format(item.total_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="print-total">Total: {format(total)}</p>
        <p className="print-footer">Generated {new Date().toLocaleDateString()}</p>
      </div>
    </PrintPortal>
  )
}

export function PrintableSettlementRecap({ groupName, transactions, members }) {
  const { format } = useCurrency()
  const nameOf = (id) => members.find((m) => m.id === id)?.name || 'Someone'

  return (
    <PrintPortal>
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
                  <td className="mono">{format(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="print-footer">Generated {new Date().toLocaleDateString()}</p>
      </div>
    </PrintPortal>
  )
}

// Shared by both stats recaps below — a titled table that simply doesn't
// render at all when there are no rows for it, the same "only show a
// section if it has something in it" rule every one of these sections
// already follows on the actual stats page. `renderRow` stays fully
// custom (rather than this trying to guess a generic "label + amount(s)"
// shape) since a person's row needs two figures (fronted, share) and a
// category's needs one — simplest to just let each caller render its own
// `<tr>` exactly like the page itself already does.
function PrintStatsSection({ title, rows, renderRow }) {
  if (!rows || rows.length === 0) return null
  return (
    <>
      <h2>{title}</h2>
      <table className="print-table">
        <tbody>{rows.map(renderRow)}</tbody>
      </table>
    </>
  )
}

// `recap` is the same shape formatGroupStatsRecap() takes (see
// recapText.js) — one object built once per page, feeding the text share
// and this printable version alike, so nothing about "what's in a group's
// stats recap" is decided twice.
export function PrintableGroupStatsRecap({ recap }) {
  const { format } = useCurrency()
  if (!recap) return null
  const { groupName, periodLabel, groupTotal, billCount, avgBill, peopleRows, categoryRows, monthlyRows, biggestBills } = recap

  return (
    <PrintPortal>
      <div className="print-only">
        <h1>Stats — {groupName}</h1>
        <p className="print-subtitle">{periodLabel}</p>
        <p>
          Total spent: <span className="mono">{format(groupTotal)}</span>
          {' · '}
          {billCount} bill{billCount === 1 ? '' : 's'}, avg <span className="mono">{format(avgBill)}</span>
        </p>

        <PrintStatsSection
          title="By person"
          rows={peopleRows}
          renderRow={(p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td className="mono">fronted {format(p.fronted)}</td>
              <td className="mono">share {format(p.share)}</td>
            </tr>
          )}
        />
        <PrintStatsSection
          title="By category"
          rows={categoryRows}
          renderRow={(c) => (
            <tr key={c.id || c.key}>
              <td>{c.name}</td>
              <td className="mono">{format(c.amount)}</td>
            </tr>
          )}
        />
        <PrintStatsSection
          title="By month"
          rows={monthlyRows}
          renderRow={(m) => (
            <tr key={m.key}>
              <td>{m.label}</td>
              <td className="mono">{format(m.amount)}</td>
            </tr>
          )}
        />
        <PrintStatsSection
          title="Biggest bills"
          rows={biggestBills}
          renderRow={(b) => (
            <tr key={b.id}>
              <td>{b.title}</td>
              <td>{b.paidByLabel}</td>
              <td className="mono">{format(b.total)}</td>
            </tr>
          )}
        />

        <p className="print-footer">Generated {new Date().toLocaleDateString()}</p>
      </div>
    </PrintPortal>
  )
}

// `recap` is the same shape formatAccountStatsRecap() takes.
export function PrintableAccountStatsRecap({ recap }) {
  const { format } = useCurrency()
  if (!recap) return null
  const { periodLabel, paid, consumed, overallBalance, categoryRows, byGroupRows, monthlyRows } = recap

  return (
    <PrintPortal>
      <div className="print-only">
        <h1>Your stats</h1>
        <p className="print-subtitle">{periodLabel}</p>
        <p>
          You fronted <span className="mono">{format(paid)}</span>, your share{' '}
          <span className="mono">{format(consumed)}</span>
        </p>
        <p>
          Overall balance (now):{' '}
          <span className="mono">
            {overallBalance >= 0 ? '+' : ''}
            {format(overallBalance)}
          </span>
        </p>

        <PrintStatsSection
          title="By category"
          rows={categoryRows}
          renderRow={(c) => (
            <tr key={c.id || c.key}>
              <td>{c.name}</td>
              <td className="mono">{format(c.amount)}</td>
            </tr>
          )}
        />
        <PrintStatsSection
          title="By group"
          rows={byGroupRows}
          renderRow={(g) => (
            <tr key={g.id}>
              <td>{g.name}</td>
              <td className="mono">fronted {format(g.fronted)}</td>
              <td className="mono">share {format(g.share)}</td>
            </tr>
          )}
        />
        <PrintStatsSection
          title="By month (fronted)"
          rows={monthlyRows}
          renderRow={(m) => (
            <tr key={m.key}>
              <td>{m.label}</td>
              <td className="mono">{format(m.amount)}</td>
            </tr>
          )}
        />

        <p className="print-footer">Generated {new Date().toLocaleDateString()}</p>
      </div>
    </PrintPortal>
  )
}
