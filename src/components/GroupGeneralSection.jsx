import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { ArrowRightIcon } from './icons'
import { isNotFoundError } from '../lib/notFound'

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
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [nameDraft, setNameDraft] = useState('')
  const [error, setError] = useState(null)
  const loadGroup = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('groups').select('name').eq('id', groupId).single()
    if (loadError) {
      // Already gone — bounce back to the groups list rather than sit here
      // showing a name field for a group that no longer exists.
      if (isNotFoundError(loadError)) {
        navigate('/', { state: { notice: 'This group is no longer available.' } })
        return
      }
      // Leaves name/nameDraft alone rather than blanking a real group name
      // to empty string on a transient network failure — that would read
      // as "this group got renamed to nothing" rather than "the fetch
      // failed."
      setError(loadError.message)
      return
    }
    setName(data?.name || '')
    setNameDraft(data?.name || '')
  }, [groupId, navigate])

  useEffect(() => {
    loadGroup()
  }, [loadGroup])

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
    </>
  )
}
