// Wraps the fetch Supabase's client uses for every request (REST and Auth
// alike) so a request that comes back 401 gets exactly one automatic
// do-over: force a fresh session, then replay the same request once. This
// is aimed squarely at the "jwt issued at future" class of failure — a
// client/server clock-skew rejection that a plain retry with the *same*
// token would just hit again, but that a forced refreshSession() call
// usually clears on its own, since it re-derives the token rather than
// reusing the stale one. If the refresh itself fails, or the retried
// request still comes back 401, this gives up and returns that response —
// callers already check `error` (see fetchAllRows.js and every page's load
// functions) and surface it, so a retry that didn't help still ends up
// visible rather than hanging or silently looping.
//
// Kept as a plain factory taking fetchImpl/refreshSession/isAuthUrl rather
// than reaching for the real `fetch` and `supabase.auth` directly, so this
// can be exercised with fakes in isolation instead of only against a real
// Supabase project.
export function createAuthRetryFetch({ fetchImpl = fetch, refreshSession, isAuthUrl } = {}) {
  const isAuth = isAuthUrl || ((url) => url.includes('/auth/v1/'))
  // Shared across concurrent callers so a page that fires off several
  // queries at once (every stats page does) triggers exactly one refresh
  // between them, not one per failed request.
  let refreshInFlight = null

  return async function authRetryFetch(input, init) {
    const response = await fetchImpl(input, init)
    if (response.status !== 401) return response

    // Never retry the auth server's own requests — a failed refresh
    // retrying itself is exactly how this loops forever.
    const url = typeof input === 'string' ? input : input.url
    if (isAuth(url)) return response

    if (!refreshInFlight) {
      refreshInFlight = Promise.resolve(refreshSession()).finally(() => {
        refreshInFlight = null
      })
    }
    const { error: refreshError } = await refreshInFlight
    if (refreshError) return response

    return fetchImpl(input, init)
  }
}
