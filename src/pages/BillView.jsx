import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { fetchAllGroupMembers } from '../lib/members'
import { fetchCategories } from '../lib/categories'
import { parseNumber } from '../lib/parseNumber'
import { toDateInputValue, applyDateInputValue } from '../lib/billDate'
import InlineEditable from '../components/InlineEditable'
import { formatBillRecap } from '../lib/recapText'
import { buildBillCsvRows, toCsv, downloadCsv } from '../lib/csv'
import ItemRow from '../components/ItemRow'
import ScanReceiptButton from '../components/ScanReceiptButton'
import ShareButton from '../components/ShareButton'
import MultiPayerModal from '../components/MultiPayerModal'
import { PrintableBillRecap } from '../components/PrintableRecap'
import { useCurrency } from '../context/CurrencyContext'

export default function BillView() {
  const { groupId, billId } = useParams()
  const navigate = useNavigate()
  const { format } = useCurrency()

  // Only ever needs the one flag — fetched once alongside the bill/members
  // below, never refetched, since a bill can't change which group it
  // belongs to.
  const [group, setGroup] = useState(null)
  const [bill, setBill] = useState(null)
  const [billPayers, setBillPayers] = useState([]) // the last CONFIRMED multi-payer split, [] if this bill has a single payer
  const [payerModalOpen, setPayerModalOpen] = useState(false)
  const [allMembers, setAllMembers] = useState([])
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [newItem, setNewItem] = useState({ name: '', price: '', quantity: '1' })
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [noteSaved, setNoteSaved] = useState(false)
  const [error, setError] = useState(null)

  const nameRef = useRef(null)
  const priceRef = useRef(null)
  const qtyRef = useRef(null)

  const activeMembers = allMembers.filter((m) => m.active)
  const nameOf = (id) => allMembers.find((m) => m.id === id)?.name || 'Someone'

  // Who a brand-new item defaults to being split with: the bill's own
  // "default split" setting if one's been chosen, otherwise everyone
  // currently active. Filtered against active members so a default that
  // included someone who has since left (or an archived guest) doesn't
  // silently reattach them.
  const defaultBuyerIds = (
    bill?.default_buyer_ids?.length ? bill.default_buyer_ids : activeMembers.map((m) => m.id)
  ).filter((id) => activeMembers.some((m) => m.id === id))

  const loadItems = useCallback(async () => {
    const { data } = await supabase
      .from('items')
      .select('*, item_shares(member_id, shares)')
      .eq('bill_id', billId)
      .order('created_at', { ascending: true })
    setItems(data || [])
  }, [billId])

  const loadBill = useCallback(async () => {
    // Used for realtime updates only — deliberately doesn't touch
    // noteDraft, or a bill_payers change from elsewhere would clobber
    // whatever note text is currently being typed.
    const { data: billData } = await supabase
      .from('bills')
      .select('*, bill_payers(member_id, amount)')
      .eq('id', billId)
      .single()
    setBill(billData)
    setBillPayers(billData?.bill_payers || [])
  }, [billId])

  useEffect(() => {
    async function loadBillAndMembers() {
      // Run in parallel and land in one setState pass, rather than four
      // sequential awaits each committing its own render — the "paid by"/
      // "split with" rows below only ever show once `group` is known
      // (never for the split second beforehand where its absence would
      // otherwise read as "not personal, go ahead and show them"), but a
      // fetch that lagged behind the others still meant those rows
      // flashed visible then vanished the instant it caught up. Fetching
      // everything together removes that lag rather than just papering
      // over it.
      const [billResult, allMembersData, categoriesData, groupResult] = await Promise.all([
        supabase.from('bills').select('*, bill_payers(member_id, amount)').eq('id', billId).single(),
        fetchAllGroupMembers(groupId),
        fetchCategories(groupId),
        supabase.from('groups').select('is_personal').eq('id', groupId).single(),
      ])
      const billData = billResult.data
      setBill(billData)
      setBillPayers(billData?.bill_payers || [])
      setNoteDraft(billData?.note || '')
      setAllMembers(allMembersData)
      setCategories(categoriesData)
      setGroup(groupResult.data)
    }
    loadBillAndMembers()
    loadItems()

    // `filter` narrows each subscription to *this* bill specifically —
    // without it, any change to any bill in any group you're a member of
    // (RLS already limits it to those, but not to the one bill you're
    // actually looking at) triggers a refetch here. Only possible where
    // the table has its own bill_id column: items/bill_payers both do.
    // item_shares doesn't (it only carries item_id, one join step further
    // from bill_id), and Realtime's filter can't express a join — that one
    // stays unfiltered, same as before, which is the one real limitation
    // here, not an oversight.
    const billFilter = `bill_id=eq.${billId}`
    const channel = supabase
      .channel(`bill-${billId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: billFilter }, loadItems)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_shares' }, loadItems)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bill_payers', filter: billFilter },
        loadBill
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [billId, groupId, loadItems, loadBill])

  const total = items.reduce((sum, it) => sum + Number(it.total_price), 0)
  const isMultiPayer = billPayers.length > 0
  const payerSum = billPayers.reduce((sum, p) => sum + Number(p.amount), 0)
  const payerMismatch = isMultiPayer && Math.abs(payerSum - total) > 0.01

  async function insertItemWithShares(name, unitPrice, quantity, buyerIds, categoryId = null) {
    const { data: inserted } = await supabase
      .from('items')
      .insert({
        bill_id: billId,
        name,
        unit_price: unitPrice,
        quantity,
        total_price: Math.round(unitPrice * quantity * 100) / 100,
        category_id: categoryId,
      })
      .select()
      .single()

    if (inserted && buyerIds.length) {
      await supabase
        .from('item_shares')
        .insert(buyerIds.map((id) => ({ item_id: inserted.id, member_id: id, shares: 1 })))
    }
    return inserted
  }

  async function addItem(e) {
    e.preventDefault()
    if (!newItem.name.trim()) return
    const quantity = parseNumber(newItem.quantity) || 1
    const unitPrice = parseNumber(newItem.price) || 0

    await insertItemWithShares(newItem.name.trim(), unitPrice, quantity, defaultBuyerIds)

    setNewItem({ name: '', price: '', quantity: '1' })
    loadItems()
    // Ready for the next item without reaching for the mouse.
    nameRef.current?.focus()
  }

  // Keeps Tab cycling only through name -> price -> qty -> name, instead of
  // continuing on to the Add button and beyond, for fast by-hand entry.
  function handleQtyKeyDown(e) {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      nameRef.current?.focus()
    }
  }
  function handleNameKeyDown(e) {
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault()
      qtyRef.current?.focus()
    }
  }

  async function toggleBuyer(item, memberId) {
    const existing = item.item_shares.find((s) => s.member_id === memberId)
    if (existing) {
      await supabase.from('item_shares').delete().eq('item_id', item.id).eq('member_id', memberId)
    } else {
      await supabase.from('item_shares').insert({ item_id: item.id, member_id: memberId, shares: 1 })
    }
    loadItems()
  }

  async function deleteItem(itemId) {
    await supabase.from('items').delete().eq('id', itemId)
    loadItems()
  }

  // Each of ItemRow's four click-to-edit fields (name, unit price,
  // quantity, total price) edits independently — there's no single "save
  // the whole row" step — so this is the one place that decides how
  // editing any one of the three money-related fields reconciles the
  // other two, keeping unit_price * quantity === total_price true after
  // every edit, not just at creation:
  //   - editing unit_price or quantity "forward-solves" total_price
  //     (the other of the two stays fixed, the total follows)
  //   - editing total_price "back-solves" unit_price instead (quantity
  //     stays fixed) — the same reasoning as before: a scanned item like
  //     "2x Milk, $1.29 each" corrected to a $3 total should keep
  //     reporting quantity 2 and unit_price $1.50, not a stale $1.29 that
  //     would silently disagree with the total in CSV/recap exports.
  // Same Math.round(...*100)/100 cent-rounding insertItemWithShares uses
  // going the other direction (unit price + quantity -> total) at creation.
  async function updateItemField(item, field, value) {
    const patch = { [field]: value }
    if (field === 'unit_price') {
      const quantity = Number(item.quantity) || 1
      patch.total_price = Math.round(value * quantity * 100) / 100
    } else if (field === 'quantity') {
      const unitPrice = Number(item.unit_price) || 0
      patch.total_price = Math.round(unitPrice * value * 100) / 100
    } else if (field === 'total_price') {
      const quantity = Number(item.quantity) || 1
      patch.unit_price = Math.round((value / quantity) * 100) / 100
    }
    const { error: updateError } = await supabase.from('items').update(patch).eq('id', item.id)
    if (updateError) setError(updateError.message)
    loadItems()
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

  async function saveNote() {
    await supabase.from('bills').update({ note: noteDraft || null }).eq('id', billId)
    setNoteSaved(true)
    setTimeout(() => setNoteSaved(false), 1200)
  }

  async function toggleDefaultBuyer(memberId) {
    const current = defaultBuyerIds
    const next = current.includes(memberId)
      ? current.filter((id) => id !== memberId)
      : [...current, memberId]
    await supabase.from('bills').update({ default_buyer_ids: next }).eq('id', billId)
    setBill((b) => ({ ...b, default_buyer_ids: next }))
  }

  // Backdates or postdates the bill — its own click-to-edit date, next to
  // "New items split with," rather than a dedicated form field, since most
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

  async function setBillCategory(categoryId) {
    await supabase
      .from('bills')
      .update({ category_id: categoryId || null })
      .eq('id', billId)
    setBill((b) => ({ ...b, category_id: categoryId || null }))
  }

  async function setItemCategory(itemId, categoryId) {
    await supabase
      .from('items')
      .update({ category_id: categoryId || null })
      .eq('id', itemId)
    loadItems()
  }

  async function handleScanned(parsedItems) {
    setScanning(false)
    // Case-insensitive match against this group's actual categories — the
    // model's already constrained to these exact names (see
    // buildExtractionPrompt() in receipt-parsing/extractionPrompt.js), this
    // just covers the odd capitalization drift the same way
    // parseClassifyResponse() does for the bill-categorization wizard.
    const categoryIdByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]))
    for (const p of parsedItems) {
      const unitPrice = Number(p.unit_price) || 0
      const quantity = Number(p.quantity) || 1
      const matchedCategoryId = typeof p.category === 'string' ? categoryIdByName.get(p.category.toLowerCase()) : null
      // Nothing the model was confident enough to name on its own (including
      // every item from the OCR-only strategy, which never suggests one at
      // all) falls back to whatever category was already set on the bill
      // itself, if any — chosen by a person before scanning, presumably
      // because most of what's on this particular receipt is that kind of
      // thing. Only when the bill has no category either does the item end
      // up genuinely uncategorized, same as before.
      const categoryId = matchedCategoryId || bill?.category_id || null
      await insertItemWithShares(p.name || 'Item', unitPrice, quantity, defaultBuyerIds, categoryId)
    }
    loadItems()
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

  // The "paid by" dropdown always needs an option matching whoever's
  // currently set, even if they've since left the group — otherwise the
  // select would silently show the wrong person.
  const paidByOptions = allMembers.filter((m) => m.active || m.id === bill?.paid_by)

  function exportCsv() {
    const { header, rows } = buildBillCsvRows(items, allMembers)
    const filename = `${(bill?.title || 'bill').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`
    downloadCsv(filename, toCsv(header, rows))
  }

  return (
    <div className="page receipt-page">
      <header className="page-header">
        <Link to={`/groups/${groupId}`} className="btn-link">
          ← Back
        </Link>
        <h1>{bill?.title}</h1>
      </header>

      <div className="bill-note-row">
        <textarea
          className="bill-note"
          placeholder="Add a note — what this was for, who was around that week…"
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={saveNote}
          rows={2}
        />
        {noteSaved && <span className="muted note-saved">Saved</span>}
      </div>

      {/* "Paid by" only ever means something when it could be someone other
          than you — a personal space has exactly one member, forever, so
          every bill is trivially paid by (and split with) just them; see
          createBill in GroupView.jsx, which already defaults paid_by to
          the creator with no picker involved. */}
      {group && !group.is_personal && (
        <div className="paid-by-row">
          <span className="muted">Paid by</span>
          {isMultiPayer ? (
            <button type="button" className="btn-link" onClick={() => setPayerModalOpen(true)}>
              {billPayers.map((p) => nameOf(p.member_id)).join(', ')} (split)
            </button>
          ) : (
            <select value={bill?.paid_by || ''} onChange={(e) => handlePaidBySelect(e.target.value)}>
              {paidByOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.isGuest ? ' (guest)' : ''}
                  {!m.active ? ' (left)' : ''}
                </option>
              ))}
              <option value="__multiple__">Multiple payers…</option>
            </select>
          )}
        </div>
      )}

      <div className="paid-by-row">
        <span className="muted">Category</span>
        <select value={bill?.category_id || ''} onChange={(e) => setBillCategory(e.target.value)}>
          <option value="">Uncategorized</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>
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

      {group && !group.is_personal && (
        <div className="default-buyers-row">
          <span className="muted">New items split with:</span>
          <div className="chip-row">
            {activeMembers.map((m) => (
              <label key={m.id} className={defaultBuyerIds.includes(m.id) ? 'buyer-chip active' : 'buyer-chip'}>
                <input
                  type="checkbox"
                  checked={defaultBuyerIds.includes(m.id)}
                  onChange={() => toggleDefaultBuyer(m.id)}
                />
                {m.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {bill && (
        <div className="bill-date-row">
          <InlineEditable
            className="mono item-editable bill-date-editable"
            inputClassName="item-editable-input"
            inputType="date"
            value={toDateInputValue(bill.created_at)}
            display={new Date(bill.created_at).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
            onSave={updateBillDate}
            ariaLabel="Bill date"
          />
        </div>
      )}

      <div className="receipt-tape">
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            members={allMembers}
            categories={categories}
            billCategoryId={bill?.category_id}
            hideBuyers={!group || group.is_personal}
            onToggleBuyer={(memberId) => toggleBuyer(item, memberId)}
            onDelete={() => deleteItem(item.id)}
            onCategoryChange={(categoryId) => setItemCategory(item.id, categoryId)}
            onUpdate={(field, value) => updateItemField(item, field, value)}
          />
        ))}
        {items.length === 0 && <p className="empty-state">No items yet — scan a receipt or add one below.</p>}
        <div className="receipt-total-row">
          <span>Total</span>
          <span className="mono">{format(total)}</span>
        </div>
      </div>

      <form onSubmit={addItem} className="add-item-form">
        <input
          ref={nameRef}
          placeholder="Item"
          value={newItem.name}
          onChange={(e) => setNewItem((v) => ({ ...v, name: e.target.value }))}
          onKeyDown={handleNameKeyDown}
        />
        <input
          ref={priceRef}
          placeholder="Price"
          inputMode="decimal"
          value={newItem.price}
          onChange={(e) => setNewItem((v) => ({ ...v, price: e.target.value }))}
        />
        <input
          ref={qtyRef}
          placeholder="Qty"
          inputMode="decimal"
          value={newItem.quantity}
          onChange={(e) => setNewItem((v) => ({ ...v, quantity: e.target.value }))}
          onKeyDown={handleQtyKeyDown}
        />
        <button type="submit" className="btn-primary">
          Add
        </button>
      </form>

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

      <div className="recap-actions">
        <ShareButton
          label="Share recap"
          title={bill?.title}
          getText={() => formatBillRecap({ ...bill, payers: billPayers }, items, allMembers, format)}
        />
        <span className="recap-divider" />
        <button type="button" className="btn-secondary" onClick={exportCsv}>
          Export CSV
        </button>
      </div>
      <PrintableBillRecap bill={{ ...bill, payers: billPayers }} items={items} members={allMembers} />

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
