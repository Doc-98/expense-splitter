import { useState } from 'react'

// How close two taps on the same target must be to count as a double tap.
export const DOUBLE_TAP_MS = 350

// Tells a double tap from a single one, per target key (a member id, for the
// "split with" avatars). The first tap always acts straight away — waiting
// to see whether a second one follows would make every ordinary tap feel
// laggy — so a double tap is "single, then double": callers make the
// double's action override whatever the first tap just did (e.g. "only
// this buyer" doesn't care what the first tap toggled).
export function createDoubleTap(delayMs = DOUBLE_TAP_MS, now = () => Date.now()) {
  let last = null // { key, time }
  return function tap(key, onSingle, onDouble) {
    const time = now()
    if (last && last.key === key && time - last.time <= delayMs) {
      last = null // a third tap starts over rather than counting as another double
      onDouble()
    } else {
      last = { key, time }
      onSingle()
    }
  }
}

// One detector per component, stable across renders.
export function useDoubleTap(delayMs = DOUBLE_TAP_MS) {
  const [tap] = useState(() => createDoubleTap(delayMs))
  return tap
}
