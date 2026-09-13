import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useCurrency, CURRENCIES } from '../context/CurrencyContext'
import { getStatsPreferences, setStatsPreferences } from '../lib/statsPreferences'
import { getGroupViewPreferences, setGroupViewPreferences, AVATAR_SIZE_OPTIONS, avatarSizeSpec } from '../lib/groupViewPreferences'
import { avatarIconCache, ACCOUNT_AVATAR_ICON_CACHE_KEY } from '../lib/avatarIconCache'
import AvatarGlyph from '../components/AvatarGlyph'
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
  ChevronIcon,
} from '../components/icons'

const AVATAR_SIZE_LABELS = { small: 'Small', medium: 'Medium', large: 'Large' }

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
  // Self-contained fetch/save, same as everything else on this page — not
  // lifted into AuthContext alongside displayName, since nothing besides
  // this picker (and Group Settings' own copy of this same picker) needs
  // to read it live; every place that actually *shows* an avatar just
  // refetches it fresh as part of the member list (see members.js).
  // Seeded from the cache (see avatarIconCache.js) rather than a bare
  // null, so a repeat visit paints the real icon immediately instead of
  // flashing the "no icon" tile lit up for the instant before the fetch
  // below resolves. undefined (never cached — a fresh browser) still
  // falls back to null, same as before.
  const [avatarIcon, setAvatarIcon] = useState(() => avatarIconCache.get(ACCOUNT_AVATAR_ICON_CACHE_KEY) ?? null)
  const [avatarError, setAvatarError] = useState(null)
  // The 16-tile grid stays collapsed behind one row until opened — it's
  // change-this-rarely settings, not something worth always rendering in
  // full, and it's also what keeps this section from turning into "one
  // giant list of avatars" as more icons get added later. Expands in
  // place (below), same move Scan Settings' provider list already uses,
  // rather than a bottom sheet — that's reserved for confirming a
  // destructive/leave-y action elsewhere in this app, and reusing it here
  // for a plain "pick one" choice would blur that meaning.
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false)
  // "Split-with avatar size" lives right below the icon picker itself —
  // both are "how your avatar looks," even though this one preference is
  // actually stored alongside the *other* per-device group-view display
  // toggles (see groupViewPreferences.js) which stay on the Groups tab.
  // Nothing wrong with two sections each keeping their own local snapshot
  // of that one shared blob — they're never mounted at the same time.
  const [groupPrefs, setGroupPrefs] = useState(getGroupViewPreferences)

  useEffect(() => {
    let cancelled = false
    async function loadAvatar() {
      const { data } = await supabase.from('profiles').select('default_avatar_icon').eq('id', user.id).single()
      if (cancelled) return
      const icon = data?.default_avatar_icon || null
      setAvatarIcon(icon)
      avatarIconCache.set(ACCOUNT_AVATAR_ICON_CACHE_KEY, icon)
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

  function updateGroupPref(partial) {
    setGroupPrefs(setGroupViewPreferences(partial))
  }

  async function saveAvatarIcon(iconId) {
    const previous = avatarIcon
    setAvatarIcon(iconId) // optimistic — a picker tile should react the instant it's tapped
    avatarIconCache.set(ACCOUNT_AVATAR_ICON_CACHE_KEY, iconId)
    setAvatarError(null)
    const { error } = await supabase.from('profiles').update({ default_avatar_icon: iconId }).eq('id', user.id)
    if (error) {
      setAvatarIcon(previous)
      avatarIconCache.set(ACCOUNT_AVATAR_ICON_CACHE_KEY, previous)
      setAvatarError(error.message)
    }
  }

  // A brief pause before collapsing back — long enough to actually see
  // the tile you just tapped light up (AvatarPicker's own is-selected
  // state), same delay the design mockup this shipped from used.
  function pickAvatarIcon(iconId) {
    saveAvatarIcon(iconId)
    setTimeout(() => setAvatarPickerOpen(false), 220)
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
      <div className={avatarPickerOpen ? 'is-open' : ''}>
        <div className="settings-row">
          <span>Choose your avatar</span>
          <button
            type="button"
            className="avatar-picker-trigger"
            onClick={() => setAvatarPickerOpen((o) => !o)}
            aria-expanded={avatarPickerOpen}
            aria-controls="avatar-picker-panel"
          >
            <span className="avatar-picker-current" aria-hidden="true">
              <AvatarGlyph iconId={avatarIcon} name={displayName} size={19} />
            </span>
            <ChevronIcon size={16} className="avatar-picker-trigger-chevron" />
          </button>
        </div>
        {/* .xwrap/.xinner — the same generic grid-rows collapse pair Scan
            Settings' provider list and every item row already use (see
            styles.css), not a bespoke one just for this. */}
        <div className="xwrap" id="avatar-picker-panel">
          <div className="xinner">
            <div className="avatar-picker-panel-inner">
              <AvatarPicker value={avatarIcon} onChange={pickAvatarIcon} name={displayName} />
            </div>
          </div>
        </div>
      </div>
      {avatarError && <p className="status-error">{avatarError}</p>}

      <div className="settings-row">
        <span>Split-with avatar size</span>
      </div>
      <div className="size-picker">
        {AVATAR_SIZE_OPTIONS.map((size) => {
          const { iconPx, className } = avatarSizeSpec(size)
          return (
            <button
              key={size}
              type="button"
              className={`size-picker-option ${groupPrefs.avatarSize === size ? 'is-selected' : ''}`}
              onClick={() => updateGroupPref({ avatarSize: size })}
              aria-pressed={groupPrefs.avatarSize === size}
            >
              <span className={`avatar ${className}`} aria-hidden="true">
                <AvatarGlyph iconId="bomb" name="Preview" size={iconPx} />
              </span>
              {AVATAR_SIZE_LABELS[size]}
            </button>
          )
        })}
      </div>
      <p className="muted">
        Applies to the "Split with" circles on a bill and each of its items — the picker used to
        choose who's in on an expense.
      </p>

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
