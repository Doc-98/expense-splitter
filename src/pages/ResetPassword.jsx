import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

// Landed on from the link in a password-reset email (Login.jsx's "Forgot
// password?" → supabase.auth.resetPasswordForEmail). Confirming that link
// establishes a temporary "recovery" session before this page ever
// mounts — supabase-js parses it straight out of the URL on load — which
// is exactly what session (from AuthContext, the same one every other
// page already reads) reflects here: undefined while that's still being
// sorted out, null if the link was invalid/expired/already used (or
// someone just navigated here directly with no link at all), or a real
// session once it's genuinely landed. No separate token-handling code
// needed on this page at all.
//
// supabase.auth.updateUser({ password }) below works identically whether
// this account already had a password or never did — the same flow that
// fixes "forgot my password" also fixes "this account only ever existed
// via magic link and has no password to forget" (see the comment on
// handleForgotPassword in Login.jsx).
export default function ResetPassword() {
  const { session } = useAuth()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus(null)

    if (password !== confirmPassword) {
      setStatus({ type: 'error', text: "Passwords don't match." })
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setStatus({ type: 'error', text: error.message })
      return
    }

    setDone(true)
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1 className="brand">Spesa</h1>
        <p className="brand-sub">Split receipts with your people.</p>

        {done ? (
          <>
            <p className="status-success">Password updated — you're signed in.</p>
            <button type="button" className="btn-primary confirm-btn" onClick={() => navigate('/', { replace: true })}>
              Continue
            </button>
          </>
        ) : session === undefined ? (
          <p className="muted">Checking your link…</p>
        ) : session === null ? (
          <>
            <p className="status-error">
              This reset link is invalid or has expired. Request a new one from the login page.
            </p>
            <button type="button" className="btn-link" onClick={() => navigate('/login', { replace: true })}>
              ← Back to login
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            <label>
              New password
              <input
                type="password"
                required
                minLength={6}
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
            </label>
            <p className="muted field-hint">At least 6 characters.</p>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving…' : 'Set new password'}
            </button>
          </form>
        )}

        {status && (
          <p className={status.type === 'error' ? 'status-error' : 'status-success'}>{status.text}</p>
        )}
      </div>
    </div>
  )
}
