import { useCurrency } from '../context/CurrencyContext'

// Your net balance in a group — what you're owed minus what you owe — in
// the layout chosen in Settings > Layout (netBalanceStyle, see
// groupViewPreferences.js):
//   'top'   a line above the debts, "Net balance:" in bold (the default)
//   'total' under the debts, after a thin rule, the total on the right
//   'note'  one small grey line under the debts, only the amount coloured
// ('off' never renders this). The direction is always spelled out in
// words, so colour is never the only cue. `highlight` is the "Highlight the
// whole balance line" setting, which 'top' and 'total' follow like the
// debt lines do.
export default function NetBalanceLine({ net, layout, highlight }) {
  const { format } = useCurrency()
  const colorClass = net > 0 ? 'balance-positive' : net < 0 ? 'balance-negative' : ''
  const direction = net > 0 ? "you're owed" : 'you owe'
  const amount = (className) => <span className={`mono ${className}`}>{format(Math.abs(net))}</span>

  if (layout === 'note') {
    return (
      <p className="balance-net-note">
        {net === 0 ? "Overall you're even" : <>Overall {direction} {amount(colorClass)}</>}
      </p>
    )
  }

  if (layout === 'total') {
    return (
      <p className={`balance-net-total ${highlight ? colorClass : ''}`}>
        <span className="balance-net-label">Net</span>
        {net === 0 ? "you're even" : <span>{direction} {amount(highlight ? '' : colorClass)}</span>}
      </p>
    )
  }

  return (
    <p className={`balance-line ${highlight ? colorClass : ''}`}>
      <strong>Net balance:</strong>{' '}
      {net === 0 ? "you're even overall" : <>{direction} {amount(highlight ? '' : colorClass)}</>}
    </p>
  )
}
