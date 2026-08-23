// The Supabase client already retries once on its own (see
// authRetryFetch.js) before a request's failure ever reaches page code — so
// if an error gets here and still looks auth-related, that automatic retry
// already tried and didn't clear it. A plain page reload is the most
// reliable thing to suggest at that point: it re-runs the whole auth
// handshake from scratch, rather than just the one retry a page's own load()
// gets to attempt.
const AUTH_ERROR_HINTS = ['jwt', 'token', 'unauthorized', 'not authenticated']

export function loadErrorMessage(error) {
  const message = error?.message || String(error)
  const looksAuthRelated = AUTH_ERROR_HINTS.some((hint) => message.toLowerCase().includes(hint))
  return looksAuthRelated ? `${message} — try refreshing the page.` : message
}
