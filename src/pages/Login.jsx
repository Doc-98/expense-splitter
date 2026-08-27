import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function Login() {
  // Password first — most people landing here for the first time are
  // looking for "sign in" / "register," not a magic link, which is the
  // less familiar of the two options. Someone who does want it just
  // switches tabs; nothing about the magic-link flow itself changes.
  const [mode, setMode] = useState('password') // 'magic' | 'password'
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  function redirectAfterLogin() {
    const next = sessionStorage.getItem('redirectAfterLogin')
    sessionStorage.removeItem('redirectAfterLogin')
    navigate(next || '/', { replace: true })
  }

  async function handleMagicLink(e) {
    e.preventDefault()
    setLoading(true)
    setStatus(null)
    // shouldCreateUser: false is the whole fix here — signInWithOtp
    // defaults to creating a brand-new account for any email that isn't
    // already registered, silently, with no display name and no chance
    // to set one (the password tab's signUp is the only place that ever
    // passes one). Someone who mistypes their email, or just wants to
    // check whether an account exists, would otherwise get a fresh,
    // half-set-up account for a stranger's inbox instead of a "no
    // account" answer. Existing users are completely unaffected — this
    // only changes what happens for an email Supabase doesn't recognize.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
    })
    setLoading(false)
    // GoTrue's own message for this case ("Signups not allowed for otp")
    // reads like a server error, not "no account with that email" — swap
    // it for something that actually points at what to do next.
    const noAccountError = error?.message?.toLowerCase().includes('signups not allowed')
    setStatus(
      error
        ? {
            type: 'error',
            text: noAccountError
              ? "No account found for that email. Switch to \"Password\" and use \"New here? Create an account\" to sign up first."
              : error.message,
          }
        : { type: 'success', text: 'Check your email for a sign-in link.' }
    )
  }

  async function handlePassword(e) {
    e.preventDefault()
    setLoading(true)
    setStatus(null)

    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName || email.split('@')[0] } },
      })
      setLoading(false)
      if (error) return setStatus({ type: 'error', text: error.message })
      if (!data.session) {
        return setStatus({
          type: 'success',
          text: 'Account created — check your email to confirm, then sign in.',
        })
      }
      redirectAfterLogin()
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setLoading(false)
      if (error) return setStatus({ type: 'error', text: error.message })
      redirectAfterLogin()
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1 className="brand">Spesa</h1>
        <p className="brand-sub">Split receipts with your people.</p>

        <div className="tab-row">
          <button
            type="button"
            className={mode === 'magic' ? 'tab active' : 'tab'}
            onClick={() => setMode('magic')}
          >
            Magic link
          </button>
          <button
            type="button"
            className={mode === 'password' ? 'tab active' : 'tab'}
            onClick={() => setMode('password')}
          >
            Password
          </button>
        </div>

        {mode === 'magic' ? (
          <form onSubmit={handleMagicLink} className="auth-form">
            <label>
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Sending…' : 'Send magic link'}
            </button>
            <p className="muted auth-magic-link-hint">
              We'll email you a link — open it on this device and you're signed in, no password
              needed. Only works for an email that already has an account.
            </p>
          </form>
        ) : (
          <form onSubmit={handlePassword} className="auth-form">
            {isSignUp && (
              <label>
                Your name
                <input
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Alex"
                />
              </label>
            )}
            <label>
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </label>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
            </button>
            <button type="button" className="btn-link" onClick={() => setIsSignUp((s) => !s)}>
              {isSignUp ? 'Already have an account? Sign in' : 'New here? Create an account'}
            </button>
          </form>
        )}

        {status && (
          <p className={status.type === 'error' ? 'status-error' : 'status-success'}>
            {status.text}
          </p>
        )}
      </div>
    </div>
  )
}
