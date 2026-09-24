// Turns a failed cloud AI response into something a person can actually act
// on, instead of the provider's raw error body landing straight in the UI —
// which used to happen literally everywhere a `!response.ok` check threw
// (Gemini a 503 overloaded response and its own JSON structure, verbatim,
// inside a plain Error). The full raw body is still logged to the console
// either way — nothing here loses the detail needed to actually debug a new
// failure mode, it just stops being the first thing a person sees.
//
// Gemini's error body nests the message at error.message; Anthropic's does
// the same (error.type distinguishes "overloaded_error"/"rate_limit_error"/
// etc., not used here — the HTTP status alone already says the same thing
// reliably, without having to keep this in sync with Anthropic's own set of
// type strings); Ollama's is flatter, usually just error: "<string>". All
// three are covered by the same shape-tolerant extraction below rather than
// three separate parsers.
function extractProviderMessage(bodyText) {
  try {
    const parsed = JSON.parse(bodyText)
    const err = parsed?.error
    if (typeof err === 'string') return err
    if (err && typeof err.message === 'string') return err.message
    if (typeof parsed?.message === 'string') return parsed.message
  } catch {
    // Not JSON (an HTML error page from a proxy, a plain-text body) — no
    // message to pull out, the status-code cases below still apply, and the
    // final fallback still gives a person something better than nothing.
  }
  return null
}

// `status` is the one signal that's always reliable here — HTTP status
// codes are a real contract every provider honors, unlike the exact shape
// or wording of an error body, which can (and already does, provider to
// provider) differ. Providers' own error text is used only as a fallback
// for whatever doesn't fall into one of these well-known cases.
export function describeProviderError(providerLabel, status, bodyText) {
  // The raw detail stays one console open away — this is the actual
  // "printed on screen for quick debugging" behavior the rest of the app
  // already leans on for a background failure, just moved from the user's
  // screen to the console, where debugging actually happens.
  console.error(`${providerLabel} API error (${status}):`, bodyText)

  if (status === 503) {
    return `${providerLabel} is overloaded right now — this happens sometimes, especially on a free-tier key. Wait a bit and try again, or switch providers in Scan settings.`
  }
  if (status === 429) {
    return `You've hit ${providerLabel}'s rate limit for now. Wait a bit before trying again, or switch providers in Scan settings.`
  }
  if (status === 401 || status === 403) {
    return `${providerLabel} rejected your API key. Double-check it in Scan settings.`
  }
  if (status === 404) {
    return `${providerLabel} couldn't find the model you've got configured. Check the model name in Scan settings.`
  }

  const message = extractProviderMessage(bodyText)
  if (message) return `${providerLabel} couldn't process this: ${message}`
  return `${providerLabel} returned an unexpected error (status ${status}). Try again in a moment, or switch providers in Scan settings.`
}

// Covers the other big failure mode Gemini/Claude calls never actually
// guarded against — fetch() itself rejecting (offline, DNS, a dropped
// mobile connection mid-upload) rather than the provider ever getting a
// chance to respond at all, which used to surface as a raw
// "TypeError: Failed to fetch" — accurate, but meaningless to anyone who
// isn't reading this file's own source. Not used for Ollama, which already
// has its own, more specific "likely blocked by CORS" message for this
// exact failure — this is only for the two cloud providers, where a plain
// connectivity problem really is the most likely cause.
export function describeNetworkError(providerLabel) {
  return `Couldn't reach ${providerLabel} — check your connection and try again.`
}
