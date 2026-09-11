// A single uppercase initial from a member's name — the only thing every
// compact avatar-circle picker in the app needs (an item's "split with", a
// bill's default split), kept as one shared helper so they all derive it
// the same way rather than each re-deriving `name.charAt(0)` slightly
// differently. Falls back to "?" for a blank/missing name rather than an
// empty circle.
export function memberInitial(name) {
  const trimmed = (name || '').trim()
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?'
}
