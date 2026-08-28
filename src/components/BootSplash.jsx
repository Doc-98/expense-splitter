// Shown for the two unavoidable moments of first-load work that have no
// UI of their own worth showing mid-flight: RequireAuth checking whether
// there's a session at all (App.jsx), and — once there is — Groups.jsx's
// own first fetch of the groups list, whenever there's truly nothing
// already cached to paint instead (see groupsListCache.js — a refresh, or
// a revisit later this session, normally has something and skips this
// entirely). Same mark as the favicon/app icon, enlarged, so it reads as
// "the app is opening" rather than an unstyled "Loading…" stall — the
// same trick most apps with any kind of cold-start delay (Slack, Spotify,
// banking apps) use to make a fetch look intentional instead of slow.
export default function BootSplash() {
  return (
    <div className="boot-splash" role="status">
      <div className="boot-splash-mark" aria-hidden="true">
        S
      </div>
      <div className="boot-splash-ring" aria-hidden="true" />
      <span className="visually-hidden">Loading Spesa…</span>
    </div>
  )
}
