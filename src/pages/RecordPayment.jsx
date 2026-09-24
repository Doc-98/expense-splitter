import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { fetchAllGroupMembers } from '../lib/members'
import { loadErrorMessage } from '../lib/loadErrorMessage'
import { parseNumber } from '../lib/parseNumber'
import { getGroupViewPreferences } from '../lib/groupViewPreferences'
import { isNotFoundError } from '../lib/notFound'
import AvatarGlyph from '../components/AvatarGlyph'
import BackButton from '../components/BackButton'

// Its own page now (Settle Up and History both made the same move already
// this round) instead of a form wedged at the bottom of the group page.
// Settings > Layout's own "Record a payment layout" toggle picks which of
// the two field layouts below actually render — see AvatarField — read
// fresh on mount (a plain useState(getter), same as every other per-device
// preference in this app; nothing here needs it to update live while this
// page is already open).
export default function RecordPayment() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [group, setGroup] = useState(null)
  const [allMembers, setAllMembers] = useState([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [layout] = useState(() => getGroupViewPreferences().paymentFormLayout)

  const loadGroup = useCallback(async () => {
    const { data, error: groupError } = await supabase.from('groups').select('*').eq('id', groupId).single()
    if (groupError) {
      // Already gone (deleted from its own Danger Zone, elsewhere, while
      // this page was open) — bounce back rather than leave this form
      // sitting open against a group that no longer exists.
      if (isNotFoundError(groupError)) {
        navigate('/', { state: { notice: 'This group is no longer available.' } })
        return
      }
      setError(`Couldn't load this group: ${loadErrorMessage(groupError)}`)
      return
    }
    setGroup(data)
  }, [groupId, navigate])

  const loadMembers = useCallback(async () => {
    try {
      setAllMembers(await fetchAllGroupMembers(groupId))
    } catch (err) {
      setError(`Couldn't load this group's members: ${loadErrorMessage(err)}`)
    }
  }, [groupId])

  useEffect(() => {
    loadGroup()
    loadMembers()
  }, [loadGroup, loadMembers])

  // Picking someone on one side who's already picked on the other clears
  // the other side instead of letting the same person sit in both at
  // once — the dropdown layout already ruled this out structurally (see
  // the disabled check below), the avatar layout needs it enforced here
  // since nothing about tapping a circle stops you reaching for the same
  // one twice.
  function pick(field, memberId) {
    if (field === 'from') {
      setFrom(memberId)
      if (to === memberId) setTo('')
    } else {
      setTo(memberId)
      if (from === memberId) setFrom('')
    }
  }

  async function submit(e) {
    e.preventDefault()
    const amt = parseNumber(amount)
    if (!from || !to || from === to || !amt || submitting) return
    setSubmitting(true)
    setError(null)
    const { error: paymentError } = await supabase.from('payments').insert({
      group_id: groupId,
      from_member: from,
      to_member: to,
      amount: amt,
      created_by: user.id,
    })
    setSubmitting(false)
    if (paymentError) {
      setError(paymentError.message)
      return
    }
    navigate(`/groups/${groupId}`)
  }

  const canSubmit = from && to && from !== to && parseNumber(amount) && !submitting

  return (
    <div className="page">
      <header className="page-header">
        <BackButton to={`/groups/${groupId}`} label={group?.name || 'Group'} />
        <h1>Record a payment</h1>
      </header>

      {error && <p className="status-error">{error}</p>}

      <form onSubmit={submit} className="stacked-form">
        {layout === 'avatars' ? (
          <>
            <span className="detail-row-label">Who paid</span>
            <div className="avatar-row">
              {allMembers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`avatar avatar-lg ${from === m.id ? 'active' : ''}`}
                  onClick={() => pick('from', m.id)}
                  disabled={to === m.id}
                  title={m.name}
                  aria-label={m.name}
                  aria-pressed={from === m.id}
                >
                  <AvatarGlyph iconId={m.avatarIcon} name={m.name} size={17} />
                </button>
              ))}
            </div>
            <span className="detail-row-label">Paid to</span>
            <div className="avatar-row">
              {allMembers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`avatar avatar-lg ${to === m.id ? 'active' : ''}`}
                  onClick={() => pick('to', m.id)}
                  disabled={from === m.id}
                  title={m.name}
                  aria-label={m.name}
                  aria-pressed={to === m.id}
                >
                  <AvatarGlyph iconId={m.avatarIcon} name={m.name} size={17} />
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <label>
              Who paid
              <select value={from} onChange={(e) => pick('from', e.target.value)} aria-label="Who paid">
                <option value="">Who paid…</option>
                {allMembers.map((m) => (
                  <option key={m.id} value={m.id} disabled={m.id === to}>
                    {m.name}
                    {m.isGuest ? ' (guest)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Paid to
              <select value={to} onChange={(e) => pick('to', e.target.value)} aria-label="Who received it">
                <option value="">Paid to…</option>
                {allMembers.map((m) => (
                  <option key={m.id} value={m.id} disabled={m.id === from}>
                    {m.name}
                    {m.isGuest ? ' (guest)' : ''}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <label>
          Amount
          <input
            placeholder="0.00"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>

        <button type="submit" className="btn-primary" disabled={!canSubmit}>
          {submitting ? 'Recording…' : 'Record payment'}
        </button>
      </form>
    </div>
  )
}
