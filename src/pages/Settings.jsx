import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useCurrency, CURRENCIES } from '../context/CurrencyContext'
import ThresholdsSection from '../components/ThresholdsSection'
import ScanSettingsSection from '../components/ScanSettingsSection'

// Everything account-level that used to be scattered across the header's
// own dropdown menu (theme, currency, thresholds, scan settings) plus the
// one thing that actually called for a real settings page to exist:
// changing your own display name. The dropdown itself now just links here
// instead of holding all of this directly — see AppHeader.jsx.
export default function Settings() {
  const navigate = useNavigate()
  const { user, displayName, setDisplayName } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { code, setCurrency } = useCurrency()

  const [nameDraft, setNameDraft] = useState(displayName)
  const [nameSaved, setNameSaved] = useState(false)
  const [nameError, setNameError] = useState(null)

  // displayName loads asynchronously (see AuthContext) — arriving after
  // this page has already mounted is the common case, not an edge case,
  // since the dropdown link to here doesn't wait on it. Also picks up our
  // own successful save below, though at that point it's just resyncing
  // to what nameDraft already says.
  useEffect(() => {
    setNameDraft(displayName)
  }, [displayName])

  async function saveDisplayName(e) {
    e.preventDefault()
    const trimmed = nameDraft.trim()
    if (!trimmed || trimmed === displayName) return
    setNameError(null)
    const { error } = await supabase.from('profiles').update({ display_name: trimmed }).eq('id', user.id)
    if (error) {
      setNameError(error.message)
      return
    }
    // Optimistic, straight into AuthContext — every other place your name
    // shows (the header chip, any group you're in) reads from the same
    // shared value, so this is the one update that makes it show up
    // everywhere at once rather than needing a refetch or reload.
    setDisplayName(trimmed)
    setNameSaved(true)
    setTimeout(() => setNameSaved(false), 1500)
  }

  return (
    <div className="page">
      <header className="page-header">
        <button type="button" className="btn-link" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <h1>Settings</h1>
      </header>

      <h2 className="settings-section-title">Your name</h2>
      <p className="muted">Shown to everyone in every group you're part of.</p>
      <form onSubmit={saveDisplayName} className="inline-form">
        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          placeholder="Your name"
          maxLength={80}
        />
        <button type="submit" className="btn-primary" disabled={!nameDraft.trim()}>
          {nameSaved ? 'Saved!' : 'Save'}
        </button>
      </form>
      {nameError && <p className="status-error">{nameError}</p>}

      <h2 className="settings-section-title">Appearance</h2>
      <div className="settings-row">
        <span>Dark mode</span>
        <label className="switch">
          <input type="checkbox" checked={theme === 'dark'} onChange={toggleTheme} aria-label="Dark mode" />
          <span className="switch-slider" />
        </label>
      </div>

      <h2 className="settings-section-title">Currency</h2>
      <div className="settings-row">
        <span>Amounts shown as</span>
        <select value={code} onChange={(e) => setCurrency(e.target.value)}>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.symbol} {c.code}
            </option>
          ))}
        </select>
      </div>

      <h2 className="settings-section-title">Spending &amp; scanning</h2>
      {/* Collapsed by default — both of these are long enough on their own
          (a full category list; four scan strategies each with their own
          sub-fields) that leaving them permanently expanded would make
          Settings mostly about them rather than a short page most people
          only glance at. Same <details>/<summary> disclosure pattern
          already used on the Guide page. Each section's actual content is
          ThresholdsSection/ScanSettingsSection — shared with their own
          standalone pages at /thresholds and /scan-settings, which stay
          around for existing deep links (AccountStats.jsx, CategorizeBills.jsx,
          ScanReceiptButton.jsx) straight to one or the other. */}
      <details className="collapsible-section">
        <summary>Spending thresholds</summary>
        <div className="collapsible-section-body">
          <ThresholdsSection />
        </div>
      </details>
      <details className="collapsible-section">
        <summary>Scan settings</summary>
        <div className="collapsible-section-body">
          <ScanSettingsSection />
        </div>
      </details>
    </div>
  )
}
