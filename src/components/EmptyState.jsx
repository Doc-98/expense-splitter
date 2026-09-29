// An empty screen or section that says what it is and what to do next:
// an icon, a short title, one line of explanation, and (usually) a button.
// The button only ever takes you somewhere that already exists — focuses
// the field that creates the thing, links to the page that does — never a
// new flow of its own.
//
// Button style follows what it does: `btn-primary` when it starts
// something ("Create a group", "Add a bill"), `btn-secondary` when it
// only takes you somewhere ("Back to the group", "Settle up"). The caller
// passes the finished element as `action`.
export default function EmptyState({ icon: Icon, title, children, action, note, className = '' }) {
  return (
    <div className={`empty-card ${className}`}>
      {Icon && (
        <span className="empty-card-icon" aria-hidden="true">
          <Icon size={24} />
        </span>
      )}
      <p className="empty-card-title">{title}</p>
      {children && <p className="empty-card-text">{children}</p>}
      {action && <div className="empty-card-action">{action}</div>}
      {note && <p className="empty-card-note">{note}</p>}
    </div>
  )
}
