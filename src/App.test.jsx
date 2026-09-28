import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import App from './App'

// The sign-in round trip for an invite link opened while signed out: the
// real App routing, AuthContext, RequireAuth and Login — with the pages at
// either end (and the chrome around them) stubbed out.
const { auth } = vi.hoisted(() => ({
  auth: { listener: null, session: null },
}))
vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: auth.session }, error: null }),
      onAuthStateChange: (cb) => {
        auth.listener = cb
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
    },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
  },
}))
vi.mock('./components/PwaUpdater', () => ({ default: () => null }))
vi.mock('./components/InstallPrompt', () => ({ default: () => null }))
vi.mock('./components/AppHeader', () => ({ default: () => null }))
vi.mock('./pages/JoinGroup', () => ({ default: () => <p>Join page</p> }))
vi.mock('./pages/ClaimGuest', () => ({ default: () => <p>Claim page</p> }))
vi.mock('./pages/Groups', () => ({ default: () => <p>Groups page</p> }))
// Pulls in the PWA plugin's virtual module, which only exists in a real build.
vi.mock('./pages/Settings', () => ({ default: () => null }))

const SESSION = { user: { id: 'user-1', email: 'friend@example.com' } }

async function openAt(path) {
  window.history.pushState({}, '', path)
  render(<App />)
  await screen.findByText(/Split receipts with your people|page$/)
}

async function signIn() {
  await act(async () => auth.listener('SIGNED_IN', SESSION))
}

beforeEach(() => {
  window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  auth.session = null
  auth.listener = null
})

afterEach(() => localStorage.clear())

describe('opening an invite link while signed out', () => {
  it('asks them to sign in, saying why, then goes straight to the invite', async () => {
    await openAt('/join/abc123')
    expect(window.location.pathname).toBe('/login')
    expect(screen.getByText(/to join the group you were invited to/)).toBeInTheDocument()

    await signIn()
    expect(await screen.findByText('Join page')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/join/abc123')
  })

  it('works for a guest-claim link too', async () => {
    await openAt('/claim/tok-1')
    expect(screen.getByText(/to claim your guest history/)).toBeInTheDocument()
    await signIn()
    expect(await screen.findByText('Claim page')).toBeInTheDocument()
  })

  it('still remembers the invite when the sign-in happens in another tab (email confirmation)', async () => {
    await openAt('/join/abc123')
    // The confirmation link opens a fresh tab at the site root, with its
    // own empty sessionStorage.
    sessionStorage.clear()
    window.history.pushState({}, '', '/')
    auth.session = SESSION
    render(<App />)
    expect(await screen.findAllByText('Join page')).not.toHaveLength(0)
    expect(window.location.pathname).toBe('/join/abc123')
  })
})

describe('signing in with nothing pending', () => {
  it('goes to the groups list, with no invite note on the sign-in screen', async () => {
    await openAt('/login')
    expect(screen.queryByText(/you were invited to/)).not.toBeInTheDocument()
    await signIn()
    expect(await screen.findByText('Groups page')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
  })
})
