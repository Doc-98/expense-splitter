import { useState } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useCurrency } from '../context/CurrencyContext'
import { getStatsPreferences, setStatsPreferences, THRESHOLDS_POSITION_OPTIONS } from '../lib/statsPreferences'
import { getGroupViewPreferences, setGroupViewPreferences, PAYMENT_FORM_LAYOUT_OPTIONS } from '../lib/groupViewPreferences'
import { GRANULARITIES, granularityLabel } from './TimeRangeSelector'
import { DEFAULT_CATEGORIES } from '../lib/categories'
import { ChevronIcon } from './icons'

const THEME_MODES = ['light', 'dark', 'system']
const THEME_MODE_LABELS = { light: 'Light', dark: 'Dark', system: 'System' }
const PAYMENT_FORM_LAYOUT_LABELS = { dropdowns: 'Dropdowns', avatars: 'Avatars' }
const THRESHOLDS_POSITION_LABELS = { top: 'Top', bottom: 'Bottom', hidden: 'Hidden' }

// Dummy figures for the previews below — never real user data, just
// standing in for it (see each preview's own comment for why those
// particular numbers/names). Picked once, outside the component, rather
// than computed on every render.
const PREVIEW_GROCERIES = DEFAULT_CATEGORIES.find((c) => c.name === 'Groceries')
const PREVIEW_TRANSPORT = DEFAULT_CATEGORIES.find((c) => c.name === 'Transport')

// Every per-device "how things are laid out" preference in the app,
// pulled into one place — previously scattered across Profile
// (Appearance, Stats) and Groups (its own Display heading). None of that
// moved storage-wise (theme still lives in ThemeContext's own
// localStorage key, Stats prefs in statsPreferences.js, the rest in
// groupViewPreferences.js) — only where the *controls* live moved, same
// as Split-with avatar size did a couple of rounds ago. Genuinely
// self-contained like every other Settings section: reads each
// preference fresh via useState(getter), writes straight back through
// each one's own setter.
//
// Five of the rows below (the switches, Record a payment layout, and
// Budgets position) can reveal a live preview of what the setting
// actually changes — this component's own idea of what a settings page
// should do, not something these particular controls needed on their
// own. `openPreview` is deliberately a single key, not a set: only one
// preview is ever open at once (opening a new one closes whichever was
// open), so the page never turns into a wall of expanded examples. A
// row's own label toggles its preview open/closed; changing the row's
// value (flipping the switch, tapping a tab) always opens it, on the
// theory that seeing the effect of the change you just made is more
// useful than requiring a second tap for it. Each preview is real
// markup/CSS this app already uses elsewhere (.stats-summary.is-slim,
// .balance-line, .card-list-item, .avatar) with a couple of exceptions
// noted at each one, not a separate mini design system of its own.
export default function SettingsLayoutSection() {
  const { mode, setMode } = useTheme()
  const { format } = useCurrency()
  const [statsPrefs, setStatsPrefsState] = useState(getStatsPreferences)
  const [groupPrefs, setGroupPrefsState] = useState(getGroupViewPreferences)
  const [openPreview, setOpenPreview] = useState(null)

  function updateStatsPref(partial) {
    setStatsPrefsState(setStatsPreferences(partial))
  }

  function updateGroupPref(partial) {
    setGroupPrefsState(setGroupViewPreferences(partial))
  }

  function toggleLabel(key) {
    setOpenPreview((cur) => (cur === key ? null : key))
  }

  return (
    <>
      <h2 className="settings-section-title">Appearance</h2>
      <div className="settings-row">
        <span>Theme</span>
      </div>
      <div className="tab-row">
        {THEME_MODES.map((m) => (
          <button
            key={m}
            type="button"
            className={`tab ${mode === m ? 'active' : ''}`}
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
          >
            {THEME_MODE_LABELS[m]}
          </button>
        ))}
      </div>
      <p className="muted">"System" follows your device's own light/dark setting, live.</p>

      <h2 className="settings-section-title">Stats</h2>
      <div className="settings-row">
        <span>Default period</span>
      </div>
      <div className="tab-row">
        {GRANULARITIES.map((g) => (
          <button
            key={g}
            type="button"
            className={`tab ${statsPrefs.defaultGranularity === g ? 'active' : ''}`}
            onClick={() => updateStatsPref({ defaultGranularity: g })}
            aria-pressed={statsPrefs.defaultGranularity === g}
          >
            {granularityLabel(g)}
          </button>
        ))}
      </div>

      <div className={openPreview === 'budgetsPosition' ? 'is-open' : ''}>
        <div className="settings-row">
          <button type="button" className="settings-row-label-btn" onClick={() => toggleLabel('budgetsPosition')}>
            Budgets position on Your Stats
            <ChevronIcon size={14} className="settings-row-chevron" />
          </button>
        </div>
        <div className="tab-row">
          {THRESHOLDS_POSITION_OPTIONS.map((p) => (
            <button
              key={p}
              type="button"
              className={`tab ${statsPrefs.thresholdsPosition === p ? 'active' : ''}`}
              onClick={() => {
                updateStatsPref({ thresholdsPosition: p })
                setOpenPreview('budgetsPosition')
              }}
              aria-pressed={statsPrefs.thresholdsPosition === p}
            >
              {THRESHOLDS_POSITION_LABELS[p]}
            </button>
          ))}
        </div>
        <div className="xwrap">
          <div className="xinner">
            <div className="settings-preview-box">
              <p className="settings-preview-eyebrow">Preview</p>
              <BudgetsPositionPreview position={statsPrefs.thresholdsPosition} format={format} />
            </div>
          </div>
        </div>
      </div>

      <h2 className="settings-section-title">Group pages</h2>

      <div className={openPreview === 'quickStats' ? 'is-open' : ''}>
        <div className="settings-row">
          <button type="button" className="settings-row-label-btn" onClick={() => toggleLabel('quickStats')}>
            Show Quick stats on the group page
            <ChevronIcon size={14} className="settings-row-chevron" />
          </button>
          <label className="switch">
            <input
              type="checkbox"
              checked={groupPrefs.showQuickStats}
              onChange={(e) => {
                updateGroupPref({ showQuickStats: e.target.checked })
                setOpenPreview('quickStats')
              }}
              aria-label="Show Quick stats on the group page"
            />
            <span className="switch-slider" />
          </label>
        </div>
        <div className="xwrap">
          <div className="xinner">
            <div className="settings-preview-box">
              <p className="settings-preview-eyebrow">Preview</p>
              {groupPrefs.showQuickStats ? (
                <div className="stats-summary is-slim">
                  <div className="stats-summary-item">
                    <span className="stats-summary-value mono">{format(42)}</span>
                    <span className="muted">this week</span>
                  </div>
                  <div className="stats-summary-item">
                    <span className="stats-summary-value mono">{format(186.5)}</span>
                    <span className="muted">this month</span>
                  </div>
                </div>
              ) : (
                <p className="settings-preview-empty-note">
                  Hidden — the group page goes straight from the balance to the action buttons.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={openPreview === 'lentBorrowed' ? 'is-open' : ''}>
        <div className="settings-row">
          <button type="button" className="settings-row-label-btn" onClick={() => toggleLabel('lentBorrowed')}>
            Show "You lent/borrowed" on each bill
            <ChevronIcon size={14} className="settings-row-chevron" />
          </button>
          <label className="switch">
            <input
              type="checkbox"
              checked={groupPrefs.showLentBorrowedStatus}
              onChange={(e) => {
                updateGroupPref({ showLentBorrowedStatus: e.target.checked })
                setOpenPreview('lentBorrowed')
              }}
              aria-label="Show 'You lent' or 'You borrowed' status on each bill"
            />
            <span className="switch-slider" />
          </label>
        </div>
        <div className="xwrap">
          <div className="xinner">
            <div className="settings-preview-box">
              <p className="settings-preview-eyebrow">Preview</p>
              <LentBorrowedPreview on={groupPrefs.showLentBorrowedStatus} format={format} />
            </div>
          </div>
        </div>
      </div>

      <div className={openPreview === 'highlightBalance' ? 'is-open' : ''}>
        <div className="settings-row">
          <button type="button" className="settings-row-label-btn" onClick={() => toggleLabel('highlightBalance')}>
            Highlight the whole balance line
            <ChevronIcon size={14} className="settings-row-chevron" />
          </button>
          <label className="switch">
            <input
              type="checkbox"
              checked={groupPrefs.highlightFullBalanceLine}
              onChange={(e) => {
                updateGroupPref({ highlightFullBalanceLine: e.target.checked })
                setOpenPreview('highlightBalance')
              }}
              aria-label="Highlight the whole balance line red or green, not just the amount"
            />
            <span className="switch-slider" />
          </label>
        </div>
        <div className="xwrap">
          <div className="xinner">
            <div className="settings-preview-box">
              <p className="settings-preview-eyebrow">Preview</p>
              <BalanceLinePreview on={groupPrefs.highlightFullBalanceLine} format={format} />
            </div>
          </div>
        </div>
      </div>
      <p className="muted">
        Applies to the "You owe…" / "…owes You" lines under a group's title. On (the default) colors
        the whole line; off leaves the line in the ordinary text color and colors only the amount.
      </p>

      <div className={openPreview === 'paymentLayout' ? 'is-open' : ''}>
        <div className="settings-row">
          <button type="button" className="settings-row-label-btn" onClick={() => toggleLabel('paymentLayout')}>
            Record a payment layout
            <ChevronIcon size={14} className="settings-row-chevron" />
          </button>
        </div>
        <div className="tab-row">
          {PAYMENT_FORM_LAYOUT_OPTIONS.map((l) => (
            <button
              key={l}
              type="button"
              className={`tab ${groupPrefs.paymentFormLayout === l ? 'active' : ''}`}
              onClick={() => {
                updateGroupPref({ paymentFormLayout: l })
                setOpenPreview('paymentLayout')
              }}
              aria-pressed={groupPrefs.paymentFormLayout === l}
            >
              {PAYMENT_FORM_LAYOUT_LABELS[l]}
            </button>
          ))}
        </div>
        <div className="xwrap">
          <div className="xinner">
            <div className="settings-preview-box">
              <p className="settings-preview-eyebrow">Preview</p>
              <PaymentLayoutPreview layout={groupPrefs.paymentFormLayout} />
            </div>
          </div>
        </div>
      </div>
      <p className="muted">
        Dropdowns pick "Who paid" and "Paid to" from a plain list; Avatars pick each by tapping their
        own avatar circle instead, same as "Split with" on a bill.
      </p>
    </>
  )
}

// "Batman"/"Robin" rather than a real member's name, for the same reason
// every other preview here uses obviously-fake data — this is a demo of
// the setting, never anything that could be mistaken for this account's
// own balance. Two lines, one each way, so both colors
// (balance-negative/balance-positive) show regardless of which one this
// account would actually see more often.
function BalanceLinePreview({ on, format }) {
  return (
    <>
      <p className={`balance-line ${on ? 'balance-negative' : ''}`}>
        You owe <strong>Batman</strong>{' '}
        <span className={`mono ${on ? '' : 'balance-negative'}`}>{format(1.41)}</span>
      </p>
      <p className={`balance-line ${on ? 'balance-positive' : ''}`}>
        <strong>Robin</strong> owes You{' '}
        <span className={`mono ${on ? '' : 'balance-positive'}`}>{format(26.9)}</span>
      </p>
    </>
  )
}

// Same real .card-list-item/.bill-amount-* markup a bill row renders with
// — just two standing examples instead of this group's actual bills, one
// lent (green) and one borrowed (red) so both colors show up regardless
// of which way this account usually leans.
function LentBorrowedPreview({ on, format }) {
  const bills = [
    { title: 'Dinner at Luigi’s', total: 42, net: 14 },
    { title: 'Movie night', total: 18.5, net: -9.25 },
  ]
  return (
    <ul className="card-list">
      {bills.map((b) => (
        <li key={b.title}>
          <div className="card-list-item">
            <span className="card-list-item-main">
              <span className="card-list-item-title">{b.title}</span>
            </span>
            <span className="bill-amount-block">
              <span className="mono bill-amount-total">{format(b.total)}</span>
              {on &&
                (b.net < 0 ? (
                  <span className="bill-amount-status balance-negative">You borrowed {format(-b.net)}</span>
                ) : (
                  <span className="bill-amount-status balance-positive">You lent {format(b.net)}</span>
                ))}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

// Mirrors RecordPayment.jsx's own two field layouts exactly (down to the
// .detail-row-label/.avatar-lg classes) — non-interactive since this is
// only ever showing what picking looks like, never actually picking
// anyone. Plain <span>s rather than real (disabled) <button>s for the
// avatar circles specifically: .avatar:disabled dims to 30% opacity,
// which would wash out the .active one's real accent-green fill along
// with the inactive ones instead of showing the two apart the way the
// real picker does.
function PaymentLayoutPreview({ layout }) {
  if (layout === 'avatars') {
    return (
      <>
        <span className="detail-row-label">Who paid</span>
        <div className="avatar-row">
          <span className="avatar avatar-lg active">A</span>
          <span className="avatar avatar-lg">B</span>
        </div>
        <span className="detail-row-label">Paid to</span>
        <div className="avatar-row">
          <span className="avatar avatar-lg">A</span>
          <span className="avatar avatar-lg active">B</span>
        </div>
      </>
    )
  }
  return (
    <>
      <label>
        Who paid
        <select disabled defaultValue="Alice">
          <option>Alice</option>
        </select>
      </label>
      <label>
        Paid to
        <select disabled defaultValue="Bob">
          <option>Bob</option>
        </select>
      </label>
    </>
  )
}

// A compact stand-in for Your Stats, not the real page reduced in size —
// TimeRangeSelector's own tabs/‹›-navigation don't shrink to fit inside a
// settings row, and none of that is what this setting actually changes
// anyway. Two .stats-summary.is-slim tiles stand in for "the rest of the
// page" (real class, so it never looks like an invented component), and
// the Budgets block itself is the one piece of real content that
// actually moves — one category under budget, one over, so both
// .stats-bar-fill states (the plain accent fill and the over-budget
// warn one) show up the same way the real Budgets section on Your Stats
// would use them, just at a width that reliably fits inside a settings
// row on a phone rather than reusing .stats-bar-row's own fixed label/
// value column widths (tuned for the full-width Stats page, not a
// nested preview).
function BudgetsPositionPreview({ position, format }) {
  const rest = (
    <div className="stats-summary is-slim">
      <div className="stats-summary-item">
        <span className="stats-summary-value mono">{format(248.3)}</span>
        <span className="muted">your share</span>
      </div>
      <div className="stats-summary-item">
        <span className="stats-summary-value mono balance-positive">+{format(42)}</span>
        <span className="muted">balance</span>
      </div>
    </div>
  )
  const budgets = (
    <div className="settings-preview-budgets-block">
      <p className="settings-preview-budgets-title">Budgets</p>
      <div className="settings-preview-budget-row">
        <span className="settings-preview-budget-label">
          <span className="category-dot" style={{ background: PREVIEW_GROCERIES.color }} />
          {PREVIEW_GROCERIES.name}
        </span>
        <div className="settings-preview-budget-track">
          <div className="settings-preview-budget-fill" style={{ width: '72%', background: PREVIEW_GROCERIES.color }} />
        </div>
        <span className="mono settings-preview-budget-value">
          {format(180)} / {format(250)}
        </span>
      </div>
      <div className="settings-preview-budget-row">
        <span className="settings-preview-budget-label">
          <span className="category-dot" style={{ background: PREVIEW_TRANSPORT.color }} />
          {PREVIEW_TRANSPORT.name}
        </span>
        <div className="settings-preview-budget-track">
          <div className="settings-preview-budget-fill over-budget" style={{ width: '100%' }} />
        </div>
        <span className="mono settings-preview-budget-value balance-negative">
          {format(96)} / {format(80)}
        </span>
      </div>
    </div>
  )

  if (position === 'hidden') {
    return (
      <div className="settings-preview-stats-mock">
        {rest}
        <p className="settings-preview-empty-note">Not shown on Your Stats at all.</p>
      </div>
    )
  }

  return (
    <div className="settings-preview-stats-mock">
      {position === 'top' ? budgets : null}
      {rest}
      {position === 'bottom' ? budgets : null}
    </div>
  )
}
