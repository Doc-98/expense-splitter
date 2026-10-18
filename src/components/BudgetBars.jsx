import { useCurrency } from '../context/CurrencyContext'

// Budget bars, shared by Your Stats' Budgets section and a group's own
// "Your budgets" section: each row is a category, how much of its cap
// you've spent, and the two amounts. Over budget turns the bar and the
// amounts the "money out" red. `rows` come from budgetRows() (lib/budgets.js)
// with a `color` added; `hereByKey`, on a group's page, adds how much of
// each was spent in that group, when that's not all of it.
export default function BudgetBars({ rows, hereByKey }) {
  const { format } = useCurrency()
  return (
    <div className="stats-bars">
      {rows.map((t) => {
        const here = hereByKey?.[t.key] ?? 0
        return (
          <div key={t.key} className="stats-bar-row">
            <span className="stats-bar-label">
              <span className="category-dot" style={{ background: t.color }} />
              {t.name}
            </span>
            <div className="stats-bar-track">
              <div
                className={`stats-bar-fill ${t.over ? 'over-budget' : ''}`}
                style={{
                  width: `${Math.min(100, (t.spent / t.amount) * 100)}%`,
                  background: t.over ? undefined : t.color,
                }}
              />
            </div>
            <span className={`mono threshold-bar-value ${t.over ? 'balance-negative' : ''}`}>
              <span className="stats-bar-amount">{format(t.spent)}</span> /{' '}
              <span className="stats-bar-amount">{format(t.amount)}</span>
              {hereByKey && here !== t.spent && (
                <span className="comparison-badge muted">{format(here)} in this group</span>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}
