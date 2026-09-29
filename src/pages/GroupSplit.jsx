import { Outlet, useMatch } from 'react-router-dom'
import GroupView from './GroupView'
import EmptyState from '../components/EmptyState'
import { ReceiptIcon } from '../components/icons'
import { useMediaQuery } from '../lib/useMediaQuery'

// Wide enough for the bill list and a bill side by side: a laptop, or a
// tablet held sideways. Kept in step with the @media block for
// .group-split in src/styles/layout.css.
export const SPLIT_MEDIA_QUERY = '(min-width: 1024px)'

// The one route element for both /groups/:groupId and
// /groups/:groupId/bills/:billId (see App.jsx), so the group page stays
// mounted while bills open and close beside it: no reload, no lost scroll
// position or filters.
//
// On a phone (or anything narrower than SPLIT_MEDIA_QUERY) this renders
// exactly one page, as before: the bill when one is open, else the group.
// On a wide screen the group's bill list sits on the left and the open
// bill (the child route, via <Outlet>) on the right, each scrolling on its
// own; with no bill open the right pane says how to open one.
export default function GroupSplit() {
  const wide = useMediaQuery(SPLIT_MEDIA_QUERY)
  const billMatch = useMatch('/groups/:groupId/bills/:billId')
  const activeBillId = billMatch?.params.billId ?? null

  if (!wide) return activeBillId ? <Outlet /> : <GroupView />

  return (
    <div className="group-split">
      <div className="group-split-list">
        {/* Only one page's print recap at a time: the open bill's when
            there is one, else the group's own. */}
        <GroupView activeBillId={activeBillId} printable={!activeBillId} />
      </div>
      {/* data-own-keys: the list's ↑/↓/Enter/←/→ shortcuts leave keys
          pressed in here alone (see useListKeyboardNav.js). */}
      <div className="group-split-detail" data-own-keys>
        {activeBillId ? (
          // Keyed by bill, so switching bills starts the bill page fresh
          // (its own drafts and open rows) exactly as navigating between
          // two separate bill pages always has.
          <Outlet key={activeBillId} />
        ) : (
          <div className="page">
            <EmptyState icon={ReceiptIcon} title="No bill open">
              Pick a bill from the list to see and edit it here, or add a new one.
            </EmptyState>
          </div>
        )}
      </div>
    </div>
  )
}
