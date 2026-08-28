// Shown for the two unavoidable moments of first-load work that have no
// UI of their own worth showing mid-flight: RequireAuth checking whether
// there's a session at all (App.jsx), and — once there is — the one-time
// warm-up Groups.jsx does the very first time this tab opens the groups
// list (see bootState.js). Same mark as the favicon/app icon, enlarged,
// so it reads as "the app is opening" rather than an unstyled "Loading…"
// stall — the same trick most apps with any kind of cold-start delay
// (Slack, Spotify, banking apps) use to make a fetch look intentional
// instead of slow.
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
