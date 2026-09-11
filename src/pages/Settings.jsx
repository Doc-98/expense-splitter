import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useCurrency, CURRENCIES } from '../context/CurrencyContext'
import { getStatsPreferences, setStatsPreferences } from '../lib/statsPreferences'
import { getBillCreationPreferences, setBillCreationPreferences } from '../lib/billCreationPreferences'
import { signOutAndClearCaches } from '../lib/signOut'
import { GRANULARITIES, granularityLabel } from '../components/TimeRangeSelector'
import BudgetsSection from '../components/BudgetsSection'
import ScanSettingsSection from '../components/ScanSettingsSection'
import GuideSection from '../components/GuideSection'
import AboutSection from '../components/AboutSection'
import SettingsGroupsSection from '../components/SettingsGroupsSection'
import SettingsUpdatesSection from '../components/SettingsUpdatesSection'
import SettingsNav from '../components/SettingsNav'
import AvatarPicker from '../components/AvatarPicker'
import ConfirmSheet from '../components/ConfirmSheet'
import BackButton from '../components/BackButton'
import {
  MenuIcon,
  ProfileIcon,
  GroupsNavIcon,
  BudgetIcon,
  ScanIcon,
  GuideIcon,
  UpdatesIcon,
  AboutIcon,
  ArrowRightIcon,
} from '../components/icons'

const SECTIONS = [
  { id: 'profile', label: 'Profile', Icon: ProfileIcon },
  { id: 'groups', label: 'Groups', Icon: GroupsNavIcon },
  { id: 'budgets', label: 'Budgets', Icon: BudgetIcon },
  { id: 'scan', label: 'Scan', Icon: ScanIcon },
  { id: 'guide', label: 'How to Use', Icon: GuideIcon },
  { id: 'updates', label: 'Updates', Icon: UpdatesIcon },
  { id: 'about', label: 'About', Icon: AboutIcon },
]

// Your name, dark mode, currency, and the two per-device stats preferences
// that used to also be settable from inline controls on Your Stats itself
// (statsPreferences.js — the default period and where Budgets sits on that
// page). Those inline controls (a "Set ___ as default" link, and a link in
// Your Stats' own Budgets section toggling its position) are gone now —
// this is the only place either preference is set from.
function ProfileSection() {
  const { user, displayName, setDisplayName } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { code, setCurrency } = useCurrency()

  const [nameDraft, setNameDraft] = useState(displayName)
  const [nameError, setNameError] = useState(null)
  const [prefs, setPrefs] = useState(getStatsPreferences)
  const [billPrefs, setBillPrefs] = useState(getBillCreationPreferences)
  // Self-contained fetch/save, same as everything else on this page — not
  // lifted into AuthContext alongside displayName, since nothing besides
  // this picker (and Group Settings' own copy of this same picker) needs
  // to read it live; every place that actually *shows* an avatar just
  // refetches it fresh as part of the member list (see members.js).
  const [avatarIcon, setAvatarIcon] = useState(null)
  const [avatarError, setAvatarError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function loadAvatar() {
      const { data } = await supabase.from('profiles').select('default_avatar_icon').eq('id', user.id).single()
      if (!cancelled) setAvatarIcon(data?.default_avatar_icon || null)
    }
    loadAvatar()
    return () => {
      cancelled = true
    }
  }, [user.id])

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
    setDisplayName(trimmed)
    // Nothing to reset here — nameDraft already holds `trimmed` (or
    // something whitespace-different from it), and displayName now matches
    // it, so the submit button's disabled-until-changed guard below (see
    // Groups.jsx/GroupView.jsx's own input-with-submit) fades it right back
    // out on its own, no separate "Saved!" state needed.
  }

  function updatePref(partial) {
    setPrefs(setStatsPreferences(partial))
  }

  function updateBillPref(partial) {
    setBillPrefs(setBillCreationPreferences(partial))
  }

  async function saveAvatarIcon(iconId) {
    const previous = avatarIcon
    setAvatarIcon(iconId) // optimistic — a picker tile should react the instant it's tapped
    setAvatarError(null)
    const { error } = await supabase.from('profiles').update({ default_avatar_icon: iconId }).eq('id', user.id)
    if (error) {
      setAvatarIcon(previous)
      setAvatarError(error.message)
    }
  }

  return (
    <>
      <h2 className="settings-section-title">Your name</h2>
      <p className="muted">Shown to everyone in every group you're part of.</p>
      <form onSubmit={saveDisplayName} className="inline-form">
        <div className="input-with-submit">
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder="Your name"
            maxLength={80}
          />
          <button
            type="submit"
            className="input-submit-btn"
            disabled={!nameDraft.trim() || nameDraft.trim() === displayName}
            aria-label="Save name"
          >
            <ArrowRightIcon size={16} />
          </button>
        </div>
      </form>
      {nameError && <p className="status-error">{nameError}</p>}

      <h2 className="settings-section-title">Avatar</h2>
      <p className="muted">
        Your default icon everywhere you're a member — pick one to help tell you apart from someone with
        the same initial. Any group can still set its own, from that group's Settings.
      </p>
      <AvatarPicker value={avatarIcon} onChange={saveAvatarIcon} name={displayName} />
      {avatarError && <p className="status-error">{avatarError}</p>}

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

      <h2 className="settings-section-title">Stats</h2>
      <div className="settings-row">
        <span>Default period</span>
        <select
          value={prefs.defaultGranularity}
          onChange={(e) => updatePref({ defaultGranularity: e.target.value })}
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
          value={prefs.thresholdsPosition}
          onChange={(e) => updatePref({ thresholdsPosition: e.target.value })}
        >
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
        </select>
      </div>

      <h2 className="settings-section-title">Adding bills</h2>
      <p className="muted">
        Show an optional Amount field on "Add bill" — filling it in creates the bill with a single item
        already in place, so a one-off expense doesn't need itemizing. Set separately for groups and your
        personal space, since they tend to differ.
      </p>
      <div className="settings-row">
        <span>Quick amount in groups</span>
        <label className="switch">
          <input
            type="checkbox"
            checked={billPrefs.quickAmountInGroups}
            onChange={(e) => updateBillPref({ quickAmountInGroups: e.target.checked })}
            aria-label="Quick amount in groups"
          />
          <span className="switch-slider" />
        </label>
      </div>
      <div className="settings-row">
        <span>Quick amount in personal space</span>
        <label className="switch">
          <input
            type="checkbox"
            checked={billPrefs.quickAmountInPersonal}
            onChange={(e) => updateBillPref({ quickAmountInPersonal: e.target.checked })}
            aria-label="Quick amount in personal space"
          />
          <span className="switch-slider" />
        </label>
      </div>
    </>
  )
}

const CONTENT = {
  profile: ProfileSection,
  groups: SettingsGroupsSection,
  budgets: BudgetsSection,
  scan: ScanSettingsSection,
  guide: GuideSection,
  updates: SettingsUpdatesSection,
  about: AboutSection,
}

export default function Settings() {
  const navigate = useNavigate()
  const [activeId, setActiveId] = useState('profile')
  const [expanded, setExpanded] = useState(false)
  const [confirmingSignOut, setConfirmingSignOut] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const activeSection = SECTIONS.find((s) => s.id === activeId)
  const Content = CONTENT[activeId]

  async function doSignOut() {
    if (signingOut) return
    setSigningOut(true)
    await signOutAndClearCaches()
    // No navigate() here — the auth-state listener in AuthContext flips
    // `session` to null the moment this resolves, and RequireAuth (see
    // App.jsx) redirects to /login on its own the same way it does for any
    // other session loss.
  }

  return (
    <div className="page settings-page">
      <header className="page-header">
        <BackButton onClick={() => navigate(-1)} />
        <button
          type="button"
          className={`icon-btn${expanded ? ' active-toggle' : ''}`}
          onClick={() => setExpanded((e) => !e)}
          aria-label="Toggle menu"
          aria-expanded={expanded}
        >
          <MenuIcon size={19} />
        </button>
        <h1>{activeSection.label}</h1>
      </header>

      <div className={`settings-shell${expanded ? ' expanded' : ''}`}>
        <SettingsNav
          sections={SECTIONS}
          activeId={activeId}
          onSelect={setActiveId}
          onSignOut={() => setConfirmingSignOut(true)}
        />
        <div className="settings-content">
          {/* Only GuideSection actually reads `compact` (its own second
              rail measures out too cramped nested inside this page's — see
              that component's own comment); every other section here just
              silently ignores the prop. */}
          <Content compact={activeId === 'guide'} />
        </div>
      </div>

      {confirmingSignOut && (
        <ConfirmSheet
          title="Sign out of Spesa?"
          body="You'll need to sign back in to see your groups again."
          confirmLabel={signingOut ? 'Signing out…' : 'Sign out'}
          onConfirm={doSignOut}
          onCancel={() => !signingOut && setConfirmingSignOut(false)}
        />
      )}
    </div>
  )
}
