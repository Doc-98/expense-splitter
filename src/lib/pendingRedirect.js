// Where to send someone once they're signed in — the page they opened while
// signed out (an invite or guest-claim link, usually), saved by RequireAuth
// on its way to /login.
//
// localStorage rather than sessionStorage: a brand-new account has to
// confirm its email first, and the confirmation link opens in a new tab,
// which starts with an empty sessionStorage — so the invite used to be
// forgotten exactly when it mattered most (someone signing up *because* of
// it). Expires after a day so an invite that was opened but never followed
// through doesn't hijack an unrelated sign-in weeks later.

const STORAGE_KEY = 'redirectAfterLogin'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

// Only same-app paths: "/join/abc", never "//evil.example" or a full URL.
function isAppPath(path) {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//')
}

export function savePendingRedirect(path, now = Date.now()) {
  if (!isAppPath(path) || path === '/' || path === '/login') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ path, savedAt: now }))
  } catch {
    // Storage blocked: after signing in they land on the groups list.
  }
}

export function peekPendingRedirect(now = Date.now()) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (saved && isAppPath(saved.path) && now - saved.savedAt <= MAX_AGE_MS) return saved.path
  } catch {
    // Storage blocked or a malformed value — nothing usable saved.
  }
  return null
}

export function takePendingRedirect(now = Date.now()) {
  const path = peekPendingRedirect(now)
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage blocked — nothing was saved to clear.
  }
  return path
}

// What the sign-in screen tells someone who arrived from a link.
export function pendingRedirectReason(path) {
  if (path?.startsWith('/join/')) return 'join'
  if (path?.startsWith('/claim/')) return 'claim'
  return null
}
