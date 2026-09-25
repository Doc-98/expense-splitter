// The Supabase client already retries once on its own (see
// authRetryFetch.js) before a request's failure ever reaches page code — so
// if an error gets here and still looks auth-related, that automatic retry
// already tried and didn't clear it. A plain page reload is the most
// reliable thing to suggest at that point: it re-runs the whole auth
// handshake from scratch, rather than just the one retry a page's own load()
// gets to attempt.
const AUTH_ERROR_HINTS = ['jwt', 'token', 'unauthorized', 'not authenticated']

// PGRST003: PostgREST ran out of database connections ("Timed out acquiring
// connection from connection pool"). 57014: Postgres statement timeout.
// Both mean "overloaded, retry shortly", not anything the person did wrong.
const BUSY_CODES = new Set(['PGRST003', '57014'])
const BUSY_HINTS = /connection pool|statement timeout/i
const NETWORK_HINTS = /failed to fetch|networkerror|load failed|network request failed/i

export function loadErrorMessage(error) {
  const message = error?.message || String(error)
  if (BUSY_CODES.has(error?.code) || BUSY_HINTS.test(message)) {
    console.error('Server busy:', error)
    return 'The server is busy right now — give it a moment and try again.'
  }
  if (NETWORK_HINTS.test(message)) {
    console.error('Network error:', error)
    return "Couldn't reach the server — check your connection and try again."
  }
  const looksAuthRelated = AUTH_ERROR_HINTS.some((hint) => message.toLowerCase().includes(hint))
  return looksAuthRelated ? `${message} — try refreshing the page.` : message
}
