import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import ItemRow from '../components/ItemRow'
import ScanReceiptButton from '../components/ScanReceiptButton'

export default function BillView() {
  const { groupId, billId } = useParams()

  const [bill, setBill] = useState(null)
  const [members, setMembers] = useState([])
  const [items, setItems] = useState([])
  const [newItem, setNewItem] = useState({ name: '', price: '', quantity: '1' })
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState(null)

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

      const { data: memberRows } = await supabase
        .from('group_members')
        .select('user_id, profiles(display_name)')
        .eq('group_id', groupId)
      setMembers(
        (memberRows || []).map((row) => ({ id: row.user_id, name: row.profiles?.display_name || 'Someone' }))
      )
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

  async function addItem(e) {
    e.preventDefault()
    if (!newItem.name.trim()) return
    const quantity = Number(newItem.quantity) || 1
    const unitPrice = Number(newItem.price) || 0
    const totalPrice = Math.round(unitPrice * quantity * 100) / 100

    const { data: inserted } = await supabase
      .from('items')
      .insert({
        bill_id: billId,
        name: newItem.name.trim(),
        unit_price: unitPrice,
        quantity,
        total_price: totalPrice,
      })
      .select()
      .single()

    // Default: split evenly among everyone currently in the group.
    if (inserted && members.length) {
      await supabase
        .from('item_shares')
        .insert(members.map((m) => ({ item_id: inserted.id, user_id: m.id, shares: 1 })))
    }

    setNewItem({ name: '', price: '', quantity: '1' })
    loadItems()
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

  async function handleScanned(parsedItems) {
    setScanning(false)
    for (const p of parsedItems) {
      const unitPrice = Number(p.unit_price) || 0
      const quantity = Number(p.quantity) || 1
      const { data: inserted } = await supabase
        .from('items')
        .insert({
          bill_id: billId,
          name: p.name || 'Item',
          unit_price: unitPrice,
          quantity,
          total_price: Math.round(unitPrice * quantity * 100) / 100,
        })
        .select()
        .single()

      if (inserted && members.length) {
        await supabase
          .from('item_shares')
          .insert(members.map((m) => ({ item_id: inserted.id, user_id: m.id, shares: 1 })))
      }
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

  return (
    <div className="page receipt-page">
      <header className="page-header">
        <Link to={`/groups/${groupId}`} className="btn-link">
          ← Back
        </Link>
        <h1>{bill?.title}</h1>
      </header>

      <div className="paid-by-row">
        <span className="muted">Paid by</span>
        <select value={bill?.paid_by || ''} onChange={(e) => setPaidBy(e.target.value)}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <div className="receipt-tape">
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            members={members}
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
          placeholder="Item"
          value={newItem.name}
          onChange={(e) => setNewItem((v) => ({ ...v, name: e.target.value }))}
        />
        <input
          placeholder="Price"
          inputMode="decimal"
          value={newItem.price}
          onChange={(e) => setNewItem((v) => ({ ...v, price: e.target.value }))}
        />
        <input
          placeholder="Qty"
          inputMode="decimal"
          value={newItem.quantity}
          onChange={(e) => setNewItem((v) => ({ ...v, quantity: e.target.value }))}
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
    </div>
  )
}
