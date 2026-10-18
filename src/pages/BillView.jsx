import { Fragment, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { parseAmount } from '../lib/parseNumber'
import { applyDateInputValue } from '../lib/billDate'
import InlineEditable from '../components/InlineEditable'
import { formatBillRecap } from '../lib/recapText'
import { buildBillCsvRows, toCsv, downloadCsv } from '../lib/csv'
import ItemRow from '../components/ItemRow'
import ScanReceiptButton from '../components/ScanReceiptButton'
import ShareButton from '../components/ShareButton'
import MultiPayerModal from '../components/MultiPayerModal'
import BillDetails from '../components/BillDetails'
import SimpleBillAmount from '../components/SimpleBillAmount'
import AddItemForm from '../components/AddItemForm'
import { PrintableBillRecap } from '../components/PrintableRecap'
import BackButton from '../components/BackButton'
import { ReceiptIcon } from '../components/icons'
import { useCurrency } from '../context/CurrencyContext'
import { useSwipeToDelete } from '../lib/useSwipeToDelete'
import { getGroupViewPreferences } from '../lib/groupViewPreferences'
import { useBillData } from '../lib/useBillData'
import { useBillItemActions } from '../lib/useBillItemActions'
import { LoadingState, SkeletonLines } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import { groupItemsByCategory } from '../lib/itemGroups'
import { categoryColor } from '../lib/categoryPalette'

// The bill page. What it shows from the database, and keeping that
// current, is useBillData's job; changes to items are useBillItemActions';
// the details panel, the one-item amount card and the add-item form are
// their own components. What's left here is the bill's own fields (title,
// payers, category, date, who new items are split with), the receipt
// itself, and scanning.
export default function BillView() {
  const { groupId, billId } = useParams()
  const navigate = useNavigate()
  const { format } = useCurrency()

  const {
    group,
    bill,
    setBill,
    billPayers,
    setBillPayers,
    allMembers,
    categories,
    items,
    setItems,
    itemsStatus,
    error,
    setError,
    refreshItems,
    deletingIdsRef,
    buyerWritesPendingRef,
  } = useBillData({ groupId, billId })
  const [payerModalOpen, setPayerModalOpen] = useState(false)
  // Default "split with" saves, one after another — see saveDefaultBuyers.
  const defaultBuyersWriteRef = useRef(Promise.resolve())
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState(null)
  // No stored "mode" — a bill with exactly one item shows the simple
  // amount-card view below instead of the itemized receipt, purely
  // because items.length === 1 (see the "+ Add another item" ghost row
  // further down). `itemizing` is the one bit of real UI state this
  // needs on top of that: whether the ghost row has been tapped, so the
  // itemized view (with its own add-item form) can be shown to add a
  // second item *before* that second item exists yet. It's reset back to
  // false the moment items.length leaves 1 in either direction, so a
  // bill that itemizes and is later swipe-deleted back down to one item
  // lands back on the plain amount-card view rather than staying stuck
  // showing the add-item form — no special-case code for that direction,
  // just this one guard.
  const [itemizing, setItemizing] = useState(false)
  useEffect(() => {
    if (items.length !== 1) setItemizing(false)
  }, [items.length])
  const isSimpleView = items.length === 1 && !itemizing

  // The add-item form's name field — the empty state's "Add an item"
  // moves you there.
  const nameRef = useRef(null)

  // One shared swipe-to-delete instance for the whole item list (see
  // useSwipeToDelete.js for why this is called once here rather than once
  // per row) — bindSwipe is handed down to each ItemRow.
  const { bind: bindSwipe } = useSwipeToDelete()

  const activeMembers = allMembers.filter((m) => m.active)

  const { avatarSize, itemCategoryDisplay } = getGroupViewPreferences()
  // Settings > Layout's "Item categories": under each item (the default,
  // see ItemRow) or grouped under a header per category with its
  // subtotal. Grouping needs categories to group by.

  // Who a brand-new item defaults to being split with: the bill's own
  // "default split" setting if one's been chosen, otherwise everyone
  // currently active. Filtered against active members so a default that
  // included someone who has since left (or an archived guest) doesn't
  // silently reattach them.
  const defaultBuyerIds = (
    bill?.default_buyer_ids?.length ? bill.default_buyer_ids : activeMembers.map((m) => m.id)
  ).filter((id) => activeMembers.some((m) => m.id === id))

  const {
    addItem,
    addScannedItems,
    toggleBuyer,
    setOnlyBuyer,
    deleteItem,
    updateItemField,
    setItemCategory,
  } = useBillItemActions({
    billId,
    items,
    setItems,
    refreshItems,
    setError,
    deletingIdsRef,
    buyerWritesPendingRef,
    defaultBuyerIds,
    billCategoryId: bill?.category_id,
    categories,
  })

  const total = items.reduce((sum, it) => sum + Number(it.total_price), 0)
  const isMultiPayer = billPayers.length > 0
  const payerSum = billPayers.reduce((sum, p) => sum + Number(p.amount), 0)
  const payerMismatch = isMultiPayer && Math.abs(payerSum - total) > 0.01

  // The simple view's own amount field — same total_price back-solve as
  // updateItemField's 'total_price' branch (useBillItemActions.js; quantity stays fixed at
  // 1, unit_price follows), just reached directly since the simple view
  // never shows quantity/unit price at all.
  function saveSimpleAmount(value) {
    const amount = parseAmount(value)
    if (!Number.isNaN(amount)) updateItemField(items[0], 'total_price', amount)
  }

  // Choosing a specific person switches (or stays) on the simple
  // single-payer path — any existing multi-payer split gets cleared, since
  // bill_payers having rows is what signals "this bill uses multiple
  // payers" everywhere else that reads it.
  async function handlePaidBySelect(value) {
    if (value === '__multiple__') {
      setPayerModalOpen(true)
      return
    }
    setError(null)
    const { error: shareError } = await supabase.from('bill_payers').delete().eq('bill_id', billId)
    if (shareError) return setError(shareError.message)
    const { error: billError } = await supabase.from('bills').update({ paid_by: value }).eq('id', billId)
    if (billError) return setError(billError.message)
    setBill((b) => ({ ...b, paid_by: value }))
    setBillPayers([])
  }

  // Called only once the modal's own validation has already confirmed the
  // amounts sum exactly to the bill total — nothing here needs to
  // re-validate that. Delete-then-insert rather than diffing old vs new
  // rows: the whole payer set can change shape between edits (someone
  // added, someone removed), and this data is small enough that the extra
  // round-trip cost doesn't matter.
  async function handleConfirmPayers(payers) {
    setError(null)
    const { error: deleteError } = await supabase.from('bill_payers').delete().eq('bill_id', billId)
    if (deleteError) return setError(deleteError.message)
    const { error: insertError } = await supabase
      .from('bill_payers')
      .insert(payers.map((p) => ({ bill_id: billId, member_id: p.member_id, amount: p.amount })))
    if (insertError) return setError(insertError.message)
    const { error: billError } = await supabase.from('bills').update({ paid_by: null }).eq('id', billId)
    if (billError) return setError(billError.message)
    setBill((b) => ({ ...b, paid_by: null }))
    setBillPayers(payers.map((p) => ({ member_id: p.member_id, amount: p.amount })))
    setPayerModalOpen(false)
  }

  function toggleDefaultBuyer(memberId) {
    const current = defaultBuyerIds
    saveDefaultBuyers(current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId])
  }

  // Double tap: new items default to just this member.
  function setOnlyDefaultBuyer(memberId) {
    saveDefaultBuyers([memberId])
  }

  // "Add another item" on a one-item bill: the next item starts out split
  // the same way as the first — usually right (the same people are sharing
  // the rest of the receipt), and it's what "Next item split with", now
  // shown, picks up from. Skipped when it already matches, or when the
  // first item has no one current on it (nothing sensible to copy).
  function startItemizing() {
    const firstItemIds = items[0].item_shares
      .map((s) => s.member_id)
      .filter((id) => activeMembers.some((m) => m.id === id))
    const same =
      firstItemIds.length === defaultBuyerIds.length && firstItemIds.every((id) => defaultBuyerIds.includes(id))
    if (group && !group.is_personal && firstItemIds.length && !same) saveDefaultBuyers(firstItemIds)
    setItemizing(true)
  }

  // Optimistic, same reasoning as GroupGeneralSection's saveAvatarIcon —
  // and chained, so a toggle and the double tap right behind it are saved
  // in the order they happened. A failure puts back what was there before
  // this change.
  function saveDefaultBuyers(next) {
    const previous = defaultBuyerIds
    setBill((b) => ({ ...b, default_buyer_ids: next }))
    defaultBuyersWriteRef.current = defaultBuyersWriteRef.current.then(async () => {
      const { error: updateError } = await supabase.from('bills').update({ default_buyer_ids: next }).eq('id', billId)
      if (updateError) {
        setBill((b) => ({ ...b, default_buyer_ids: previous }))
        setError(updateError.message)
      }
    })
  }

  // Backdates or postdates the bill — its own click-to-edit date, next to
  // "Next item split with," rather than a dedicated form field, since most
  // bills are added the same day they happened and don't need one; this
  // is for the rest: adding one late without it landing in the wrong
  // week's stats, or fixing up an imported bill by hand. Just an UPDATE on
  // created_at, the column already doing the "bill's date" job everywhere
  // else in the app (see src/lib/billDate.js) — no new column needed.
  async function updateBillDate(dateInputValue) {
    const next = applyDateInputValue(bill.created_at, dateInputValue)
    const { error: updateError } = await supabase.from('bills').update({ created_at: next }).eq('id', billId)
    if (updateError) return setError(updateError.message)
    setBill((b) => ({ ...b, created_at: next }))
  }

  // The header title, click-to-edit like everything else InlineEditable
  // covers on this page (the date just above, the simple-view amount
  // below) — the *other* way to rename a bill, the group page's ⋮ menu (GroupBillList.jsx),
  // is a full replace-the-row form instead since it's picking one bill out
  // of a list rather than already looking straight at it. Trimming (and
  // the empty-stays-unrenamed guard) happens here rather than in
  // InlineEditable itself, same division of labor as ItemRow's saveName —
  // InlineEditable only ever guarantees a *non-empty* draft made it this
  // far, not a validly trimmed one.
  async function updateBillTitle(value) {
    const trimmed = value.trim()
    if (!trimmed || trimmed === bill.title) return
    const { error: updateError } = await supabase.from('bills').update({ title: trimmed }).eq('id', billId)
    if (updateError) return setError(updateError.message)
    setBill((b) => ({ ...b, title: trimmed }))
  }

  async function setBillCategory(categoryId) {
    const previous = bill?.category_id ?? null
    setBill((b) => ({ ...b, category_id: categoryId || null })) // optimistic, same reasoning as toggleDefaultBuyer above
    const { error: updateError } = await supabase
      .from('bills')
      .update({ category_id: categoryId || null })
      .eq('id', billId)
    if (updateError) {
      setBill((b) => ({ ...b, category_id: previous }))
      setError(updateError.message)
    }
  }

  async function handleScanned(parsedItems) {
    setScanning(false)
    await addScannedItems(parsedItems)
  }

  // Lets you try the whole scan → review → assign-buyers flow without
  // scanning a real receipt at all — handy for a quick demo, or for
  // checking the rest of the flow while you're still deciding on a
  // scanning strategy in Scan settings.
  function trySampleReceipt() {
    handleScanned([
      { name: 'Whole milk 1L', unit_price: 1.29, quantity: 2 },
      { name: 'Sourdough bread', unit_price: 3.5, quantity: 1 },
      { name: 'Free-range eggs (6)', unit_price: 2.8, quantity: 1 },
      { name: 'Cherry tomatoes', unit_price: 2.1, quantity: 1 },
      { name: 'Parmesan 200g', unit_price: 4.6, quantity: 1 },
    ])
  }

  function exportCsv() {
    const { header, rows } = buildBillCsvRows(items, allMembers, categories, bill?.category_id)
    const filename = `${(bill?.title || 'bill').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`
    downloadCsv(filename, toCsv(header, rows))
  }

  const groupedByCategory = itemCategoryDisplay === 'grouped' && categories.length > 0

  function renderItemRow(item) {
    return (
      <ItemRow
        key={item.id}
        bindSwipe={bindSwipe}
        item={item}
        members={allMembers}
        categories={categories}
        billCategoryId={bill?.category_id}
        hideBuyers={!group || group.is_personal}
        avatarSize={avatarSize}
        showCategory={!groupedByCategory}
        onToggleBuyer={(memberId) => toggleBuyer(item, memberId)}
        onOnlyBuyer={(memberId) => setOnlyBuyer(item, memberId)}
        onDelete={() => deleteItem(item.id)}
        onCategoryChange={(categoryId) => setItemCategory(item.id, categoryId)}
        onUpdate={(field, value) => updateItemField(item, field, value)}
      />
    )
  }

  return (
    <div className="page receipt-page">
      <header className="page-header">
        <BackButton to={`/groups/${groupId}`} />
        <h1>
          <InlineEditable
            className="item-editable bill-title-editable"
            inputClassName="item-editable-input bill-title-editable-input"
            value={bill?.title ?? ''}
            display={bill?.title}
            onSave={updateBillTitle}
            ariaLabel={bill?.title ? `Rename ${bill.title}` : 'Bill title'}
          />
        </h1>
        {/* Icon mode, same position/pattern as Group View/Group Stats/Your
            Stats' own header Share button — was a centered text button
            further down the page, next to the scan section, which put it
            nowhere near where every other Share control on the app lives. */}
        <ShareButton
          icon
          menuAlign="right"
          label="Share recap"
          title={bill?.title}
          getText={() => formatBillRecap({ ...bill, payers: billPayers }, items, allMembers, format, categories)}
          onExportCsv={exportCsv}
        />
      </header>

      <BillDetails
        billId={billId}
        bill={bill}
        group={group}
        billPayers={billPayers}
        members={allMembers}
        activeMembers={activeMembers}
        categories={categories}
        defaultBuyerIds={defaultBuyerIds}
        showNextItemSplit={!isSimpleView}
        avatarSize={avatarSize}
        onPaidBySelect={handlePaidBySelect}
        onOpenPayers={() => setPayerModalOpen(true)}
        onCategoryChange={setBillCategory}
        onToggleDefaultBuyer={toggleDefaultBuyer}
        onOnlyDefaultBuyer={setOnlyDefaultBuyer}
        onDateSave={updateBillDate}
        setError={setError}
      />

      {payerMismatch && (
        <p className="status-error">
          Payer amounts ({format(payerSum)}) don't match the bill total ({format(total)}) — the
          bill's items changed since this split was set.{' '}
          <button type="button" className="btn-link" onClick={() => setPayerModalOpen(true)}>
            Fix it
          </button>
        </p>
      )}
      {error && <p className="status-error">{error}</p>}

      {isSimpleView ? (
        <SimpleBillAmount
          item={items[0]}
          members={allMembers}
          showSplit={Boolean(group && !group.is_personal)}
          avatarSize={avatarSize}
          onSaveAmount={saveSimpleAmount}
          onToggleBuyer={(memberId) => toggleBuyer(items[0], memberId)}
          onOnlyBuyer={(memberId) => setOnlyBuyer(items[0], memberId)}
          onAddAnother={startItemizing}
        />
      ) : (
        <>
          <div className="receipt-tape">
            {groupedByCategory
              ? groupItemsByCategory(items, categories, bill?.category_id).map((g) => (
                  <Fragment key={g.key}>
                    <div className="item-group-head">
                      {g.category ? (
                        <>
                          <span className="category-dot" style={{ background: categoryColor(g.category.color) }} />
                          {g.category.name}
                        </>
                      ) : (
                        'No category'
                      )}
                      <span className="item-group-total mono">{format(g.total)}</span>
                    </div>
                    {g.items.map(renderItemRow)}
                  </Fragment>
                ))
              : items.map(renderItemRow)}
            {items.length === 0 && itemsStatus === 'loading' && (
              <LoadingState label="Loading items…">
                <SkeletonLines count={3} />
              </LoadingState>
            )}
            {items.length === 0 && itemsStatus === 'error' && (
              <p className="empty-state">
                Couldn't load this bill's items.{' '}
                <button type="button" className="btn-link" onClick={refreshItems}>
                  Try again
                </button>
              </p>
            )}
            {items.length === 0 && itemsStatus === 'ready' && (
              <EmptyState
                icon={ReceiptIcon}
                title="No items yet"
                action={
                  <button type="button" className="btn-primary" onClick={() => nameRef.current?.focus()}>
                    Add an item
                  </button>
                }
              >
                Scan the receipt, or type the items in one by one.
              </EmptyState>
            )}
            <div className="receipt-total-row">
              <span>Total</span>
              <span className="mono">{itemsStatus === 'ready' ? format(total) : '—'}</span>
            </div>
          </div>

          <AddItemForm nameRef={nameRef} onAdd={addItem} />

          <ScanReceiptButton
            scanning={scanning}
            setScanning={setScanning}
            onScanned={handleScanned}
            onError={setScanError}
            categories={categories}
          />
          <button type="button" className="btn-link sample-link" onClick={trySampleReceipt}>
            Try sample items instead (no API key needed)
          </button>
          {scanError && <p className="status-error">{scanError}</p>}
        </>
      )}

      <PrintableBillRecap bill={{ ...bill, payers: billPayers }} items={items} members={allMembers} categories={categories} />

      <button type="button" className="btn-primary confirm-btn" onClick={() => navigate(`/groups/${groupId}`)}>
        Confirm
      </button>

      {payerModalOpen && (
        <MultiPayerModal
          members={activeMembers}
          billTotal={total}
          currentPayers={billPayers}
          onConfirm={handleConfirmPayers}
          onCancel={() => setPayerModalOpen(false)}
        />
      )}
    </div>
  )
}