import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { fetchAllGroupMembers } from '../lib/members'
import { parseNumber } from '../lib/parseNumber'
import ItemRow from '../components/ItemRow'
import ScanReceiptButton from '../components/ScanReceiptButton'

export default function BillView() {
  const { groupId, billId } = useParams()
  const navigate = useNavigate()

  const [bill, setBill] = useState(null)
  const [allMembers, setAllMembers] = useState([])
  const [items, setItems] = useState([])
  const [newItem, setNewItem] = useState({ name: '', price: '', quantity: '1' })
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [noteSaved, setNoteSaved] = useState(false)

  const nameRef = useRef(null)
  const priceRef = useRef(null)
  const qtyRef = useRef(null)

  const activeMembers = allMembers.filter((m) => m.active)

  // Who a brand-new item defaults to being split with: the bill's own
  // "default split" setting if one's been chosen, otherwise everyone
  // currently active. Filtered against active members so a default that
  // included someone who has since left doesn't silently reattach them.
  const defaultBuyerIds = (
    bill?.default_buyer_ids?.length ? bill.default_buyer_ids : activeMembers.map((m) => m.id)
  ).filter((id) => activeMembers.some((m) => m.id === id))

  const loadItems = useCallback(async () => {
    const { data } = await supabase
      .from('items')
      .select('*, item_shares(user_id, shares)')
      .eq('bill_id', billId)
      .order('created_at', { ascending: true })
    setItems(data || [])
  }, [billId])

  useEffect(() => {
    async function loadBillAndMembers() {
      const { data: billData } = await supabase.from('bills').select('*').eq('id', billId).single()
      setBill(billData)
      setNoteDraft(billData?.note || '')
      setAllMembers(await fetchAllGroupMembers(groupId))
    }
    loadBillAndMembers()
    loadItems()

    const channel = supabase
      .channel(`bill-${billId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, loadItems)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_shares' }, loadItems)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [billId, groupId, loadItems])

  const total = items.reduce((sum, it) => sum + Number(it.total_price), 0)

  async function insertItemWithShares(name, unitPrice, quantity, buyerIds) {
    const { data: inserted } = await supabase
      .from('items')
      .insert({
        bill_id: billId,
        name,
        unit_price: unitPrice,
        quantity,
        total_price: Math.round(unitPrice * quantity * 100) / 100,
      })
      .select()
      .single()

    if (inserted && buyerIds.length) {
      await supabase
        .from('item_shares')
        .insert(buyerIds.map((id) => ({ item_id: inserted.id, user_id: id, shares: 1 })))
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
    const existing = item.item_shares.find((s) => s.user_id === memberId)
    if (existing) {
      await supabase.from('item_shares').delete().eq('item_id', item.id).eq('user_id', memberId)
    } else {
      await supabase.from('item_shares').insert({ item_id: item.id, user_id: memberId, shares: 1 })
    }
    loadItems()
  }

  async function deleteItem(itemId) {
    await supabase.from('items').delete().eq('id', itemId)
    loadItems()
  }

  async function setPaidBy(userId) {
    await supabase.from('bills').update({ paid_by: userId }).eq('id', billId)
    setBill((b) => ({ ...b, paid_by: userId }))
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

  async function handleScanned(parsedItems) {
    setScanning(false)
    for (const p of parsedItems) {
      const unitPrice = Number(p.unit_price) || 0
      const quantity = Number(p.quantity) || 1
      await insertItemWithShares(p.name || 'Item', unitPrice, quantity, defaultBuyerIds)
    }
    loadItems()
  }

  // Lets you try the whole scan → review → assign-buyers flow without a
  // working Anthropic API key or any cost — useful while deciding if the
  // scanning feature is worth setting up billing for.
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

      <div className="paid-by-row">
        <span className="muted">Paid by</span>
        <select value={bill?.paid_by || ''} onChange={(e) => setPaidBy(e.target.value)}>
          {paidByOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {!m.active ? ' (left)' : ''}
            </option>
          ))}
        </select>
      </div>

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

      <div className="receipt-tape">
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            members={allMembers}
            onToggleBuyer={(memberId) => toggleBuyer(item, memberId)}
            onDelete={() => deleteItem(item.id)}
          />
        ))}
        {items.length === 0 && <p className="empty-state">No items yet — scan a receipt or add one below.</p>}
        <div className="receipt-total-row">
          <span>Total</span>
          <span className="mono">€{total.toFixed(2)}</span>
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
      />
      <button type="button" className="btn-link sample-link" onClick={trySampleReceipt}>
        Try sample items instead (no API key needed)
      </button>
      {scanError && <p className="status-error">{scanError}</p>}

      <button type="button" className="btn-primary confirm-btn" onClick={() => navigate(`/groups/${groupId}`)}>
        Confirm
      </button>
    </div>
  )
}
