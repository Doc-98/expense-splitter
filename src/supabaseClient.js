import { createClient } from '@supabase/supabase-js'
import { createAuthRetryFetch } from './lib/authRetryFetch'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Fails loudly at dev time rather than silently making broken requests later.
  console.warn(
    'Missing Supabase env vars. Copy .env.example to .env and fill in your project URL and anon key.'
  )
}

// See src/lib/authRetryFetch.js — every request this client makes (REST and
// Auth alike) goes through a wrapper that retries once, after a forced
// session refresh, on a 401. Aimed at "jwt issued at future"-style
// clock-skew rejections, which otherwise show up as a page's data silently
// looking empty rather than as anything a person can act on. References
// `supabase` from inside the wrapper it's passed to — safe because the
// wrapper is only ever called once a request actually goes out, by which
// point this whole module has finished evaluating and the binding below is
// assigned.
export const supabase = createClient(url, anonKey, {
  global: {
    fetch: createAuthRetryFetch({
      refreshSession: () => supabase.auth.refreshSession(),
    }),
  },
})
