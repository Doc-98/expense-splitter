// Whether this browser tab has already gotten through the app-boot screen
// once (see BootSplash.jsx) — a bare module-level flag, not React state,
// so it survives Groups.jsx unmounting and remounting every time you
// navigate away from and back to "/" within the same tab. The splash is a
// once-per-tab "the app is opening" moment; an ordinary revisit to the
// groups list later in the session falls back to its own plain inline
// "Loading your groups…" text instead, same as it always has.
let booted = false

export function hasAppBooted() {
  return booted
}

export function markAppBooted() {
  booted = true
}

// Called on sign-out (see AppHeader.jsx) — otherwise a second account
// signing in on the same tab afterward would silently skip the splash
// screen entirely on what is, for them, genuinely their first login this
// tab has seen.
export function resetBootState() {
  booted = false
}
