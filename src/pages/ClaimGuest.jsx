import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function ClaimGuest() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [preview, setPreview] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | claiming | error
  const [errorMessage, setErrorMessage] = useState(null)

  useEffect(() => {
    async function loadPreview() {
      const { data, error } = await supabase.rpc('get_claim_preview', { token })
      if (error || !data || data.length === 0) {
        setStatus('error')
        setErrorMessage('That claim link is invalid or has already been used.')
        return
      }
      setPreview(data[0])
      setStatus('ready')
    }
    loadPreview()
  }, [token])

  async function confirmClaim() {
    setStatus('claiming')
    const { data: group, error } = await supabase.rpc('claim_guest_profile', { token })
    if (error || !group) {
      setStatus('error')
      setErrorMessage(error?.message || "Couldn't claim this profile — try again.")
      return
    }
    navigate(`/groups/${group.id}`, { replace: true })
  }

  if (status === 'loading') {
    return (
      <div className="page">
        <p className="muted">Loading…</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="page">
        <p className="status-error">{errorMessage}</p>
        <Link to="/" className="btn-link">
          ← Back to your groups
        </Link>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Claim your history</h1>
      </header>
      <p>
        This link lets you take over <strong>{preview.guest_name}</strong>'s history in{' '}
        <strong>{preview.group_name}</strong> — every bill, item, and payment they were part of
        becomes yours, under your own account, instead of staying tied to a guest with no login.
      </p>
      <button
        type="button"
        className="btn-primary confirm-btn"
        onClick={confirmClaim}
        disabled={status === 'claiming'}
      >
        {status === 'claiming' ? 'Claiming…' : `Claim ${preview.guest_name}'s history`}
      </button>
    </div>
  )
}
