// Per-device record of which groups you've opened most recently — plain
// localStorage, same reasoning as statsPreferences.js and friends (a
// personal "how I use this app" fact, not data that needs to follow you to
// another device). The only thing this is for: deciding which groups are
// worth warming up in the background the moment the groups list loads
// (see prefetchGroup.js, called from Groups.jsx) — the ones you're
// actually likely to open next, not an arbitrary slice of the list.
const STORAGE_KEY = 'spesa-recent-groups'
// More than Groups.jsx will ever actually prefetch (currently 3, plus
// personal) — enough headroom that a group you visit occasionally doesn't
// fall off the list just because you opened two others in between.
const MAX_TRACKED = 10

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// Most-recent-first; a group already in the list moves back to the front
// rather than getting a duplicate entry.
export function recordGroupVisit(groupId) {
  try {
    const next = [groupId, ...readAll().filter((id) => id !== groupId)].slice(0, MAX_TRACKED)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Best-effort — a blocked or full localStorage just means the next
    // warm-up falls back to whatever Groups.jsx does when it has nothing
    // recorded yet, not a broken app.
  }
}

export function getRecentGroupIds() {
  return readAll()
}
