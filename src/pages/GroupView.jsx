import { useEffect, useRef, useState } from 'react'
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useGroupViewData } from '../lib/useGroupViewData'
import { useBillFilters } from '../lib/useBillFilters'
import { fetchBillsForRecap, exportGroupCsv, buildPersonalSpaceRecap } from '../lib/groupBillActions'
import { formatSettlementRecap, formatMultiBillRecap, formatPersonalSpaceRecap } from '../lib/recapText'
import { shareOrCopyText } from '../lib/shareText'
import { useEscapeKey } from '../lib/useEscapeKey'
import { useListKeyboardNav } from '../lib/useListKeyboardNav'
import { useConfirm } from '../lib/useConfirm'
import { useCurrency } from '../context/CurrencyContext'
import { prefetchGroupSettings } from '../lib/prefetchGroupSettings'
import { groupItemsByDate } from '../lib/dateGroups'
import { getGroupViewPreferences } from '../lib/groupViewPreferences'
import ShareButton from '../components/ShareButton'
import Pagination from '../components/Pagination'
import BillSearchPanel from '../components/BillSearchPanel'
import GroupBalanceSummary from '../components/GroupBalanceSummary'
import NewBillForm from '../components/NewBillForm'
import BulkSelectBar from '../components/BulkSelectBar'
import GroupBillList from '../components/GroupBillList'
import { PrintableSettlementRecap, PrintablePersonalSpaceRecap } from '../components/PrintableRecap'
import { SearchIcon, PieChartIcon, SettingsIcon, ReceiptIcon } from '../components/icons'
import BackButton from '../components/BackButton'
import { LoadingState, Skeleton, SkeletonRows } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import ConfirmSheet from '../components/ConfirmSheet'

const BILLS_PAGE_SIZE = 15

// The group page. What it shows from the database, and keeping that
// current, is useGroupViewData's job; the search and filters are
// useBillFilters'; each part of the screen is its own component (the
// search panel, balance summary, new-bill form, select bar and bill
// list). What's left here is putting them together, plus paging,
// selecting, deleting and sharing bills.
//
// `activeBillId` and `printable` only come from GroupSplit.jsx's wide
// layout, where this page shares the screen with an open bill: the open
// bill's row is marked in the list, and the print recap is left to the
// bill while one is open.
export default function GroupView({ activeBillId = null, printable = true }) {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { format } = useCurrency()
  // Deleting bills asks through the app's own sheet; while it's up, Escape
  // only cancels it (the page's own Escape handlers pause).
  const { confirm, sheetProps: confirmSheet, isConfirming } = useConfirm()
  const { showQuickStats, showLentBorrowedStatus, stickyFilters, highlightFullBalanceLine } = getGroupViewPreferences()

  const {
    group,
    allMembers,
    categories,
    bills,
    billPersonalTotals,
    settlement,
    weekTotal,
    monthTotal,
    historyComplete,
    error,
    setError,
    reloadAll,
    refreshBills,
  } = useGroupViewData(groupId)
  const filters = useBillFilters({ groupId, bills, historyComplete, stickyFilters, isConfirming })
  const { searchQuery, searchOpen, setSearchOpen, filtersActive, filteredBills, clearFilters } = filters

  // The empty state's "Add a bill" just moves you to the New bill field.
  const newBillInputRef = useRef(null)
  const [billsPage, setBillsPage] = useState(0)
  // Carried over router state from a page that just bounced back here
  // because whatever it was showing (a bill, in practice) had already been
  // deleted — see BillView's own not-found handling. Read once, lazily, so
  // this only ever reflects the navigation that just landed here, then
  // cleared from history immediately below so refreshing or going back
  // doesn't resurface it.
  //
  // On a wide screen this page doesn't remount when a bill beside it is
  // deleted (see GroupSplit.jsx), so a notice arriving later is picked up
  // here too, not only the one present when the page first mounted.
  const [notice, setNotice] = useState(() => location.state?.notice || null)
  useEffect(() => {
    if (!location.state?.notice) return
    setNotice(location.state.notice)
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.state, location.pathname, navigate])
  // ...and it's about the bill that was open, so it goes once another is.
  useEffect(() => {
    if (activeBillId) setNotice(null)
  }, [activeBillId])
  const [selectMode, setSelectMode] = useState(false)
  // Select mode's only entry point is a bill's own "..." menu or a long
  // press (see enterSelectModeWith below) — there's no dedicated "Select
  // bills" button, so Escape (same convention as search/filters) is what
  // lets someone back out of it without hunting for the bulk-select bar's
  // own Cancel.
  useEscapeKey(() => toggleSelectMode(), selectMode && !isConfirming)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [shareStatus, setShareStatus] = useState(null)

  // Grouped by month/day for the date dividers — only the current page's
  // worth of (filtered) bills, same slice the flat list used before
  // dividers existed.
  const visibleBills = filteredBills.slice(billsPage * BILLS_PAGE_SIZE, (billsPage + 1) * BILLS_PAGE_SIZE)
  const billGroups = groupItemsByDate(visibleBills)
  const maxPage = Math.max(0, Math.ceil(filteredBills.length / BILLS_PAGE_SIZE) - 1)
  // My own participant row in this group — bills/items/payments reference
  // group_members.id now, not the raw account ID, so anything I create
  // needs this resolved first (e.g. defaulting a new bill's payer to me).
  const myParticipantId = allMembers.find((m) => m.userId === user.id)?.id
  const isAdmin = myParticipantId && myParticipantId === group?.admin_id
  // Whether the current selection happens to cover every bill in the
  // group, not just the visible page — bills holds the group's full list
  // once historyComplete (see useGroupViewData), so this is a real
  // "delete everything" check, the same one delete_all_group_bills()
  // itself enforces server-side, not just a guess based on what's
  // currently on screen. Also requires historyComplete specifically:
  // during the brief first-paint windowed-preview phase, `bills` only
  // holds a recent slice, and selecting all of *that* would otherwise
  // still trigger the delete-everything RPC underneath a confirmation
  // dialog that only mentioned the smaller, visible count — an honesty
  // problem worth avoiding on a destructive, irreversible action even for
  // the few seconds this window is normally open.
  const allBillsSelected = Boolean(
    bills && bills.length > 0 && selectedIds.size === bills.length && historyComplete
  )

  useEffect(() => {
    if (!bills) return
    if (billsPage > maxPage) setBillsPage(maxPage)
  }, [bills, maxPage, billsPage])

  // A fresh filter (or a changed price range) should start back on page 1
  // of its own results, not strand you on whatever page you happened to be
  // on for a completely different set of bills — the clamp above only
  // catches it when the new count happens to be too small for the current
  // page, not "the results changed" in general.
  useEffect(() => {
    setBillsPage(0)
  }, [searchQuery, filters.selectedTagIds, filters.tagMatchMode, filters.priceRange])

  // ←/→ flip pages, ↑/↓ move the selected bill, Enter opens it — see
  // useListKeyboardNav.js. Disabled in select mode, where arrow keys/Enter
  // already mean something else (moving through checkboxes).
  const billNav = useListKeyboardNav({
    page: billsPage,
    setPage: setBillsPage,
    maxPage,
    itemCount: visibleBills.length,
    disabled: selectMode,
    onOpen: (index) => {
      const bill = visibleBills[index]
      if (bill) navigate(`/groups/${groupId}/bills/${bill.id}`)
    },
  })

  async function deleteBill(bill) {
    const confirmed = await confirm({
      title: `Delete "${bill.title}"?`,
      body: 'This removes all its items too.',
      confirmLabel: 'Delete',
    })
    if (!confirmed) return
    setError(null)
    const { error: deleteError } = await supabase.from('bills').delete().eq('id', bill.id)
    if (deleteError) setError(deleteError.message)
    // Just this bill: gone if the delete worked, back as it was if not.
    refreshBills([bill.id])
  }

  // Selection is independent of pagination on purpose — picking bills on
  // page 1, paging over, and picking more on page 2 before deleting all of
  // them together is a reasonable thing to want, so selectedIds isn't reset
  // on page change, only when selection mode itself is toggled off.
  function toggleSelectMode() {
    setSelectMode((v) => !v)
    setSelectedIds(new Set())
  }

  function toggleSelected(billId) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(billId)) next.delete(billId)
      else next.add(billId)
      return next
    })
  }

  async function deleteSelectedBills() {
    const count = selectedIds.size
    if (count === 0) return
    // Selecting every bill in the group and deleting them is the same
    // "wipe everything" action as the Danger Zone button, so it goes
    // through the same admin-gated RPC — this check is a courtesy (avoids
    // a doomed confirm dialog for a non-admin), the real enforcement is
    // the RPC's own admin check, same as the button.
    if (allBillsSelected && !isAdmin) {
      setError('Only the group admin can delete every bill in a group. Deselect at least one, or ask the admin.')
      return
    }
    const confirmed = await confirm({
      title: `Delete ${count} bill${count === 1 ? '' : 's'}?`,
      body: count === 1 ? 'This removes all its items too.' : 'This removes all their items too.',
      confirmLabel: 'Delete',
    })
    if (!confirmed) return
    setError(null)
    const { error: deleteError } = allBillsSelected
      ? await supabase.rpc('delete_all_group_bills', { target_group_id: groupId, delete_payments: false })
      : await supabase.from('bills').delete().in('id', Array.from(selectedIds))
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    const deletedIds = Array.from(selectedIds)
    setSelectedIds(new Set())
    setSelectMode(false)
    // Wiping the whole group is a full reload; a handful is a patch (and
    // syncBills turns a large selection into a full reload by itself).
    if (allBillsSelected) reloadAll()
    else refreshBills(deletedIds)
  }

  // Entry point for the per-bill menu's own "Select" action and a long
  // press — lands in the same state as entering select mode and then
  // ticking this one row by hand.
  function enterSelectModeWith(billId) {
    setSelectMode(true)
    setSelectedIds(new Set([billId]))
  }

  // Shared by both the per-bill menu's "Share" and the bulk select bar's
  // "Share" — see groupBillActions.js for why it fetches fresh.
  async function shareBills(billIds) {
    setError(null)
    try {
      const billsForRecap = await fetchBillsForRecap(supabase, billIds)
      const text = formatMultiBillRecap(billsForRecap, allMembers, format, categories)
      const title =
        billsForRecap.length === 1 ? billsForRecap[0].title : `${billsForRecap.length} bills — ${group?.name}`
      const result = await shareOrCopyText(text, title)
      if (result === 'copied') {
        setShareStatus('Copied to clipboard!')
        setTimeout(() => setShareStatus(null), 2000)
      } else if (result === 'failed') {
        setError("Couldn't share or copy — your browser blocked it.")
      }
    } catch (err) {
      setError(err.message)
    }
  }

  async function exportCsv() {
    setError(null)
    try {
      await exportGroupCsv(supabase, { groupId, groupName: group?.name, members: allMembers })
    } catch (err) {
      setError(err.message)
    }
  }

  const personalRecap = group?.is_personal ? buildPersonalSpaceRecap(group, bills, categories) : null

  return (
    <div className="page">
      {/* Back arrow + action icons only — no title sharing this row
          anymore (see .page-title below, its own full-width row). Back
          stays the one fixed-width item on the left; .header-spacer is
          the single explicit flex: 1 element that claims the rest of the
          row, so every icon after it sits flush against the right edge at
          the row's normal gap — the same "give the element that must grow
          its own explicit flex-grow, don't count on an unstretched child
          to do it" fix behind the .bill-list-item regression fixed
          earlier this round: there is always exactly one child here whose
          job is to grow, and it's declared, not implied. */}
      <header className="page-header">
        <BackButton to="/" label="Groups" />
        <span className="header-spacer" aria-hidden="true" />
        {/* Search moved in from the old .group-actions row below the
            header (now gone) — same toggle, same styling as every other
            icon here instead of its own .bill-search-toggle look. Stays
            in the row (rather than disappearing once open, like it used
            to) and just switches to active-toggle instead, both so the
            row's own width/spacing never shifts when it opens or closes,
            and so "something's filtered" (searchQuery/filtersActive) is
            still visible at a glance even while collapsed, same signal
            .bill-search-toggle-active used to give it. */}
        {bills && bills.length > 0 && (
          <button
            type="button"
            className={`icon-btn ${searchOpen || searchQuery || filtersActive ? 'active-toggle' : ''}`}
            onClick={() => setSearchOpen((o) => !o)}
            aria-label="Search bills"
            title="Search bills"
          >
            <SearchIcon />
          </button>
        )}
        {/* Share/Stats/Settings — Share here is the group-level action
            (settle-up recap text/PDF for a real group, the personal-space
            recap for one's own space — see buildPersonalSpaceRecap for
            why that one's built differently), merged with the
            CSV export that used to sit in its own button further down the
            page (ShareButton's onExportCsv). Gated only on settlement
            itself having loaded — same for both group types now:
            formatSettlementRecap already handles an empty settlement
            ("Everyone's even") gracefully, and formatPersonalSpaceRecap
            does the same for zero bills ("No bills yet") — onExportCsv is
            the one part still separately gated on bills actually
            existing, since there's nothing sensible to export otherwise. */}
        {settlement && (
          <ShareButton
            icon
            menuAlign="right"
            label={group?.is_personal ? 'Share' : 'Share settle-up'}
            title={group?.is_personal ? group?.name : `Settle up — ${group?.name}`}
            getText={
              group?.is_personal
                ? () => formatPersonalSpaceRecap(personalRecap, format)
                : () => formatSettlementRecap(group?.name, settlement, allMembers, format)
            }
            onExportCsv={bills && bills.length > 0 ? exportCsv : undefined}
          />
        )}
        <Link to={`/groups/${groupId}/stats`} className="icon-btn" aria-label="Stats" title="Stats">
          <PieChartIcon />
        </Link>
        {/* Members/Guests/Categories/Subscriptions are the four Group
            Settings tabs that hit the database — fired the instant this is
            clicked, same reasoning (and pattern) as AppHeader.jsx's own
            account chip warming Settings' Groups/Budgets sections. */}
        <Link
          to={`/groups/${groupId}/settings`}
          className="icon-btn"
          aria-label="Settings"
          title="Settings"
          onClick={() => prefetchGroupSettings(groupId)}
        >
          <SettingsIcon />
        </Link>
      </header>

      {notice && <p className="status-success">{notice}</p>}
      {error && <p className="status-error">{error}</p>}

      {bills && bills.length > 0 && searchOpen && <BillSearchPanel filters={filters} categories={categories} />}

      {/* The title, alone on its own row now — no icons sharing it (see
          the header above), so a long group name wraps cleanly instead of
          fighting Share/Stats/Settings for space. */}
      {group ? (
        <h1 className="page-title">{group.name}</h1>
      ) : (
        !error && <Skeleton className="skeleton-page-title" />
      )}

      {!group?.is_personal && settlement && (
        <GroupBalanceSummary
          groupId={groupId}
          settlement={settlement}
          members={allMembers}
          myParticipantId={myParticipantId}
          highlightFullBalanceLine={highlightFullBalanceLine}
        />
      )}

      {/* Quick stats moved up here, right after the action row, and slimmed
          down (.stats-summary.is-slim) — joins the title/balance/actions as
          one "your standing at a glance" block, before anything about
          adding or browsing bills starts. Plain .settings-section-title
          (not .group-stats-preview-title's own bottom-of-page divider
          treatment) — :first-of-type zeroes its border-top/padding-top
          since nothing else on this page uses that class above it, so it
          reads as a plain heading rather than a section boundary. */}
      {showQuickStats && (
        <>
          <h2 className="settings-section-title">Quick stats</h2>
          <div className="stats-summary is-slim">
            <div className="stats-summary-item">
              <span className="stats-summary-value mono">{format(weekTotal)}</span>
              <span className="muted">this week</span>
            </div>
            <div className="stats-summary-item">
              <span className="stats-summary-value mono">{format(monthTotal)}</span>
              <span className="muted">this month</span>
            </div>
          </div>
        </>
      )}

      <NewBillForm
        groupId={groupId}
        userId={user.id}
        myParticipantId={myParticipantId}
        members={allMembers}
        onError={setError}
        inputRef={newBillInputRef}
      />

      {selectMode && (
        <BulkSelectBar
          selectedCount={selectedIds.size}
          adminOnlyDelete={allBillsSelected && !isAdmin}
          onShare={() => shareBills(Array.from(selectedIds))}
          onDelete={deleteSelectedBills}
          onCancel={toggleSelectMode}
        />
      )}
      {shareStatus && <p className="muted share-status">{shareStatus}</p>}

      {bills === null && !error && (
        <LoadingState label="Loading bills…">
          <SkeletonRows count={3} withNote withAmount />
        </LoadingState>
      )}
      {bills?.length === 0 && (
        <EmptyState
          icon={ReceiptIcon}
          title="No bills yet"
          action={
            <button type="button" className="btn-primary" onClick={() => newBillInputRef.current?.focus()}>
              Add a bill
            </button>
          }
        >
          Add the first one, then scan its receipt or type the items in.
        </EmptyState>
      )}
      {bills && bills.length > 0 && filteredBills.length === 0 && (
        <EmptyState
          icon={SearchIcon}
          title="No bills match these filters"
          action={
            <button type="button" className="btn-secondary" onClick={clearFilters}>
              Clear filters
            </button>
          }
        >
          Try another word, or widen the filters.
        </EmptyState>
      )}

      <GroupBillList
        groupId={groupId}
        group={group}
        billGroups={billGroups}
        visibleBills={visibleBills}
        billNav={billNav}
        activeBillId={activeBillId}
        billPersonalTotals={billPersonalTotals}
        myParticipantId={myParticipantId}
        showLentBorrowedStatus={showLentBorrowedStatus}
        selectMode={selectMode}
        selectedIds={selectedIds}
        onToggleSelected={toggleSelected}
        onEnterSelectMode={enterSelectModeWith}
        onShare={shareBills}
        onDelete={deleteBill}
        setError={setError}
        refreshBills={refreshBills}
      />
      <Pagination page={billsPage} setPage={setBillsPage} totalItems={filteredBills.length} pageSize={BILLS_PAGE_SIZE} />

      {/* Share settle-up + Export CSV both moved up into the page header
          (see the icon-only ShareButton next to Stats/Settings) — this
          used to be its own row down here with the same two actions, and
          its own divider above it. One of these two Printable* components
          still needs to render somewhere on the page for that header
          button's "Download as PDF" to have anything to print; neither
          needs to sit visually next to the button that triggers it, and
          contributes no visible spacing of its own (print-only). Quick
          stats itself lives up near the top of the page now, right after
          the action row — nothing left down here to double up with. */}
      {!printable ? null : group?.is_personal ? (
        <PrintablePersonalSpaceRecap recap={personalRecap} />
      ) : (
        <PrintableSettlementRecap groupName={group?.name} transactions={settlement} members={allMembers} />
      )}
      {confirmSheet && <ConfirmSheet {...confirmSheet} />}
    </div>
  )
}
