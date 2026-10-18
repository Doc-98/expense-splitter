// The group page's select-mode bar: how many bills are picked, and Share /
// Delete selected / Cancel. Deleting every bill in the group at once is
// admin-only (the same rule as the Danger Zone's button), so a non-admin
// who has picked them all sees why Delete is unavailable.
export default function BulkSelectBar({ selectedCount, adminOnlyDelete, onShare, onDelete, onCancel }) {
  return (
    <div className="bulk-select-bar">
      <span>{selectedCount} selected</span>
      <div className="bulk-select-actions">
        <button type="button" className="btn-secondary" disabled={selectedCount === 0} onClick={onShare}>
          Share
        </button>
        <button
          type="button"
          className="btn-danger"
          disabled={selectedCount === 0 || adminOnlyDelete}
          onClick={onDelete}
        >
          Delete selected
        </button>
        <button type="button" className="btn-link" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {adminOnlyDelete && <p className="muted bulk-select-hint">Only the group admin can delete every bill at once.</p>}
    </div>
  )
}
