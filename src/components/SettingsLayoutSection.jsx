import { useState } from 'react'
import { useTheme } from '../context/ThemeContext'
import { getStatsPreferences, setStatsPreferences } from '../lib/statsPreferences'
import { getGroupViewPreferences, setGroupViewPreferences, PAYMENT_FORM_LAYOUT_OPTIONS } from '../lib/groupViewPreferences'
import { GRANULARITIES, granularityLabel } from './TimeRangeSelector'

const THEME_MODES = ['light', 'dark', 'system']
const THEME_MODE_LABELS = { light: 'Light', dark: 'Dark', system: 'System' }
const PAYMENT_FORM_LAYOUT_LABELS = { dropdowns: 'Dropdowns', avatars: 'Avatars' }

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
export default function SettingsLayoutSection() {
  const { mode, setMode } = useTheme()
  const [statsPrefs, setStatsPrefsState] = useState(getStatsPreferences)
  const [groupPrefs, setGroupPrefsState] = useState(getGroupViewPreferences)

  function updateStatsPref(partial) {
    setStatsPrefsState(setStatsPreferences(partial))
  }

  function updateGroupPref(partial) {
    setGroupPrefsState(setGroupViewPreferences(partial))
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
        <select
          value={statsPrefs.defaultGranularity}
          onChange={(e) => updateStatsPref({ defaultGranularity: e.target.value })}
        >
          {GRANULARITIES.map((g) => (
            <option key={g} value={g}>
              {granularityLabel(g)}
            </option>
          ))}
        </select>
      </div>
      <div className="settings-row">
        <span>Budgets position on Your Stats</span>
        <select
          value={statsPrefs.thresholdsPosition}
          onChange={(e) => updateStatsPref({ thresholdsPosition: e.target.value })}
        >
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
        </select>
      </div>

      <h2 className="settings-section-title">Group pages</h2>
      <div className="settings-row">
        <span>Show Quick stats on the group page</span>
        <label className="switch">
          <input
            type="checkbox"
            checked={groupPrefs.showQuickStats}
            onChange={(e) => updateGroupPref({ showQuickStats: e.target.checked })}
            aria-label="Show Quick stats on the group page"
          />
          <span className="switch-slider" />
        </label>
      </div>
      <div className="settings-row">
        <span>Show "You lent/borrowed" on each bill</span>
        <label className="switch">
          <input
            type="checkbox"
            checked={groupPrefs.showLentBorrowedStatus}
            onChange={(e) => updateGroupPref({ showLentBorrowedStatus: e.target.checked })}
            aria-label="Show 'You lent' or 'You borrowed' status on each bill"
          />
          <span className="switch-slider" />
        </label>
      </div>
      <div className="settings-row">
        <span>Highlight the whole balance line</span>
        <label className="switch">
          <input
            type="checkbox"
            checked={groupPrefs.highlightFullBalanceLine}
            onChange={(e) => updateGroupPref({ highlightFullBalanceLine: e.target.checked })}
            aria-label="Highlight the whole balance line red or green, not just the amount"
          />
          <span className="switch-slider" />
        </label>
      </div>
      <p className="muted">
        Applies to the "You owe…" / "…owes You" lines under a group's title. On (the default) colors
        the whole line; off leaves the line in the ordinary text color and colors only the amount.
      </p>

      <div className="settings-row">
        <span>Record a payment layout</span>
      </div>
      <div className="tab-row">
        {PAYMENT_FORM_LAYOUT_OPTIONS.map((l) => (
          <button
            key={l}
            type="button"
            className={`tab ${groupPrefs.paymentFormLayout === l ? 'active' : ''}`}
            onClick={() => updateGroupPref({ paymentFormLayout: l })}
            aria-pressed={groupPrefs.paymentFormLayout === l}
          >
            {PAYMENT_FORM_LAYOUT_LABELS[l]}
          </button>
        ))}
      </div>
      <p className="muted">
        Dropdowns pick "Who paid" and "Paid to" from a plain list; Avatars pick each by tapping their
        own avatar circle instead, same as "Split with" on a bill.
      </p>
    </>
  )
}
