import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import GroupGeneralSection from '../components/GroupGeneralSection'
import GroupMembersSection from '../components/GroupMembersSection'
import GroupGuestsSection from '../components/GroupGuestsSection'
import GroupCategoriesSection from '../components/GroupCategoriesSection'
import GroupSubscriptionsSection from '../components/GroupSubscriptionsSection'
import GroupDataSection from '../components/GroupDataSection'
import GroupDangerZoneSection from '../components/GroupDangerZoneSection'
import SettingsNav from '../components/SettingsNav'
import BackButton from '../components/BackButton'
import {
  MenuIcon,
  SettingsIcon,
  GroupsNavIcon,
  GuestIcon,
  TagIcon,
  SubscriptionIcon,
  ImportIcon,
  DangerIcon,
} from '../components/icons'
import { isNotFoundError } from '../lib/notFound'

// Same left-rail shell as the account Settings page (SettingsNav.jsx) —
// this is Group Settings' turn to get it, replacing what used to be one
// long scroll of every section stacked on top of each other. Members and
// Guests are the two sections that only mean anything once there's a group
// of more than one — a personal space has exactly one member (you)
// forever, with no invite code ever surfaced to change that (see
// is_personal on the groups table) — so those two tabs simply aren't
// offered there at all, rather than existing but showing nothing.
const ALL_SECTIONS = [
  { id: 'general', label: 'General', Icon: SettingsIcon },
  { id: 'members', label: 'Members', Icon: GroupsNavIcon, hideWhenPersonal: true },
  { id: 'guests', label: 'Guests', Icon: GuestIcon, hideWhenPersonal: true },
  { id: 'categories', label: 'Categories', Icon: TagIcon },
  { id: 'subscriptions', label: 'Subscriptions', Icon: SubscriptionIcon },
  { id: 'data', label: 'Data', Icon: ImportIcon },
  { id: 'danger', label: 'Danger Zone', Icon: DangerIcon },
]

const CONTENT = {
  general: GroupGeneralSection,
  members: GroupMembersSection,
  guests: GroupGuestsSection,
  categories: GroupCategoriesSection,
  subscriptions: GroupSubscriptionsSection,
  data: GroupDataSection,
  danger: GroupDangerZoneSection,
}

export default function GroupSettings() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const [activeId, setActiveId] = useState('general')
  const [expanded, setExpanded] = useState(false)
  // Defaults to false (show every tab) rather than null/"loading" — a
  // brief flash of Members/Guests being offered then disappearing, on the
  // rare visit to a personal space's settings, beats gating the whole nav
  // rail's first paint on this one query.
  const [isPersonal, setIsPersonal] = useState(false)

  const loadIsPersonal = useCallback(async () => {
    const { data, error } = await supabase.from('groups').select('is_personal').eq('id', groupId).single()
    if (error) {
      // Already gone (deleted from its own Danger Zone in another tab, or
      // by someone else in it, before this page ever got a chance to
      // render) — bounce back rather than let every section underneath
      // independently discover the same thing and show its own inline
      // error.
      if (isNotFoundError(error)) {
        navigate('/', { state: { notice: 'This group is no longer available.' } })
        return
      }
      // Keeps the existing safe default (show every tab) rather than
      // inventing new fallback behavior for the error case — just makes a
      // genuine failure (not just still-loading) visible somewhere.
      console.error('Failed to load group type:', error.message)
      return
    }
    setIsPersonal(data?.is_personal || false)
  }, [groupId, navigate])

  useEffect(() => {
    loadIsPersonal()
  }, [loadIsPersonal])

  const sections = useMemo(
    () => ALL_SECTIONS.filter((s) => !s.hideWhenPersonal || !isPersonal),
    [isPersonal]
  )

  // A personal-space visit deep-linked (or left over from a previous
  // visit's state) at "members"/"guests" would otherwise render a tab that
  // isn't even in the nav anymore — fall back to General same as an
  // unrecognized id would.
  const activeSection = sections.find((s) => s.id === activeId) || sections[0]
  const Content = CONTENT[activeSection.id]

  return (
    <div className="page settings-page">
      <header className="page-header">
        <BackButton to={`/groups/${groupId}`} />
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
        <SettingsNav sections={sections} activeId={activeSection.id} onSelect={setActiveId} dangerId="danger" />
        <div className="settings-content">
          <Content isPersonal={isPersonal} />
        </div>
      </div>
    </div>
  )
}
