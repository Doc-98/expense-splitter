import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { ArrowRightIcon } from './icons'
import AvatarPicker from './AvatarPicker'
import { avatarIconCache } from '../lib/avatarIconCache'

// Lifted as-is from what used to be GroupSettings.jsx's own top section —
// self-contained (own fetch, own save) same as every other Group Settings
// section now, rather than reading group data a parent shell already
// loaded. `name` (what's actually saved) and `nameDraft` (the input) stay
// separate so an unsaved in-progress edit here can't leak into anything
// elsewhere that trusts the group's *real* current name (Members' invite
// text, Danger Zone's typed-name confirmations) — those each read the
// group's name fresh themselves rather than through this component, so
// there's nothing to keep in sync here beyond this one field.
export default function GroupGeneralSection() {
  const { groupId } = useParams()
  const { user, displayName } = useAuth()
  const [name, setName] = useState('')
  const [nameDraft, setNameDraft] = useState('')
  const [error, setError] = useState(null)
  // This group's own override of your avatar (see AvatarPicker.jsx) — null
  // means "use my account default", set from Settings > Profile instead.
  // Needs the *row id* (not just the icon) since that's what the update
  // below targets — group_members.id, resolved from the group+account pair
  // rather than trusted from anywhere else, same reasoning loadGroup has
  // for reading the group's name fresh itself.
  const [memberId, setMemberId] = useState(null)
  // Seeded from the cache (see avatarIconCache.js) rather than a bare
  // null, so re-opening this group's Settings paints the real override
  // immediately instead of flashing the "no icon" tile lit up for the
  // instant before loadMember() below resolves.
  const [avatarIcon, setAvatarIcon] = useState(() => avatarIconCache.get(groupId) ?? null)
  const [avatarError, setAvatarError] = useState(null)

  const loadGroup = useCallback(async () => {
    const { data } = await supabase.from('groups').select('name').eq('id', groupId).single()
    setName(data?.name || '')
    setNameDraft(data?.name || '')
  }, [groupId])

  const loadMember = useCallback(async () => {
    const { data } = await supabase
      .from('group_members')
      .select('id, avatar_icon')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single()
    setMemberId(data?.id || null)
    const icon = data?.avatar_icon || null
    setAvatarIcon(icon)
    avatarIconCache.set(groupId, icon)
  }, [groupId, user.id])

  useEffect(() => {
    loadGroup()
    loadMember()
  }, [loadGroup, loadMember])

  async function saveName(e) {
    e.preventDefault()
    const trimmed = nameDraft.trim()
    if (!trimmed || trimmed === name) return
    setError(null)
    const { error: renameError } = await supabase.from('groups').update({ name: trimmed }).eq('id', groupId)
    if (renameError) {
      setError(renameError.message)
    } else {
      setName(trimmed)
      // Nothing else to reset — nameDraft already holds `trimmed` (or
      // something whitespace-different from it), and `name` now matches
      // it, so the submit button's disabled-until-changed guard below
      // fades it right back out on its own.
    }
  }

  async function saveAvatarIcon(iconId) {
    if (!memberId) return
    const previous = avatarIcon
    setAvatarIcon(iconId) // optimistic — a picker tile should react the instant it's tapped
    avatarIconCache.set(groupId, iconId)
    setAvatarError(null)
    const { error: updateError } = await supabase
      .from('group_members')
      .update({ avatar_icon: iconId })
      .eq('id', memberId)
    if (updateError) {
      setAvatarIcon(previous)
      avatarIconCache.set(groupId, previous)
      setAvatarError(updateError.message)
    }
  }

  return (
    <>
      <h2 className="settings-section-title">Group name</h2>
      <form onSubmit={saveName} className="inline-form">
        <div className="input-with-submit">
          <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Group name" />
          <button
            type="submit"
            className="input-submit-btn"
            disabled={!nameDraft.trim() || nameDraft.trim() === name}
            aria-label="Save group name"
          >
            <ArrowRightIcon size={16} />
          </button>
        </div>
      </form>
      {error && <p className="status-error">{error}</p>}

      <h2 className="settings-section-title">Your avatar in this group</h2>
      <p className="muted">
        Overrides your account default (Settings &gt; Profile) just for this group — handy if someone
        here shares your initial.
      </p>
      <AvatarPicker value={avatarIcon} onChange={saveAvatarIcon} name={displayName} />
      {avatarError && <p className="status-error">{avatarError}</p>}
    </>
  )
}
