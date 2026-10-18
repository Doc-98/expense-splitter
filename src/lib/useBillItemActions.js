import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { loadErrorMessage } from './loadErrorMessage'
import { createKeyedQueue } from './keyedQueue'

// Every change the bill page makes to its items: adding one (by hand or a
// whole scanned receipt), who's splitting each, editing a field, its
// category, and removing it. Takes what useBillData returns plus who new
// items are split with (`defaultBuyerIds`), and the bill's own category,
// which scanned items fall back to.
export function useBillItemActions({
  billId,
  items,
  setItems,
  refreshItems,
  setError,
  deletingIdsRef,
  buyerWritesPendingRef,
  defaultBuyerIds,
  billCategoryId,
  categories,
}) {
  // Per-item queue of pending buyer writes — see queueBuyerWrite.
  const [enqueueBuyerWrite] = useState(createKeyedQueue)

  async function insertItemWithShares(name, unitPrice, quantity, buyerIds, categoryId = null) {
    const { data: inserted, error: insertError } = await supabase
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
    if (insertError) {
      setError(insertError.message)
      return null
    }

    if (inserted && buyerIds.length) {
      const { error: sharesError } = await supabase
        .from('item_shares')
        .insert(buyerIds.map((id) => ({ item_id: inserted.id, member_id: id, shares: 1 })))
      // The item itself exists either way — a failure here just leaves it
      // unassigned, fixable directly from its own row (toggleBuyer below),
      // not worth losing the item over.
      if (sharesError) setError(sharesError.message)
    }
    return inserted
  }

  // A hand-typed item, split with whoever new items default to. Returns
  // whether it was added.
  async function addItem(name, unitPrice, quantity) {
    const inserted = await insertItemWithShares(name, unitPrice, quantity, defaultBuyerIds)
    if (!inserted) return false // insertItemWithShares already set the error
    refreshItems()
    return true
  }

  async function addScannedItems(parsedItems) {
    // Case-insensitive match against this group's actual categories — the
    // model's already constrained to these exact names (see
    // buildExtractionPrompt() in receipt-parsing/extractionPrompt.js), this
    // just covers the odd capitalization drift the same way
    // parseClassifyResponse() does for the bill-categorization wizard.
    const categoryIdByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]))
    // One bulk insert for every item, then one bulk insert for every item's
    // shares — not a sequential per-item await loop (that used to mean up
    // to two round trips *per scanned item*, so a 20+ item receipt could
    // take several seconds to fully save, wide open the whole time to
    // navigating away or deleting the bill mid-save; see useBillData's own
    // not-found handling for what used to happen when that race was lost).
    // Every scanned item shares the exact same defaultBuyerIds, so
    // batching doesn't change what gets assigned to whom, just how many
    // requests it takes to get there.
    const itemRows = parsedItems.map((p) => {
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
      const categoryId = matchedCategoryId || billCategoryId || null
      return {
        bill_id: billId,
        name: p.name || 'Item',
        unit_price: unitPrice,
        quantity,
        total_price: Math.round(unitPrice * quantity * 100) / 100,
        category_id: categoryId,
      }
    })
    if (!itemRows.length) return

    const { data: inserted, error: insertError } = await supabase.from('items').insert(itemRows).select()
    if (insertError) {
      setError(insertError.message)
      return
    }

    if (defaultBuyerIds.length) {
      const shareRows = (inserted || []).flatMap((item) =>
        defaultBuyerIds.map((id) => ({ item_id: item.id, member_id: id, shares: 1 }))
      )
      // The items themselves exist either way — a failure here just leaves
      // them unassigned, fixable directly from each row (toggleBuyer
      // below), not worth losing the scanned items over.
      if (shareRows.length) {
        const { error: sharesError } = await supabase.from('item_shares').insert(shareRows)
        if (sharesError) setError(sharesError.message)
      }
    }
    refreshItems()
  }

  // Buyer changes show at once (optimistic), and each item's writes run one
  // after another: a double tap sends a toggle and then "only this buyer"
  // within a fraction of a second, and those must reach the server in that
  // order. The items reload once an item's last queued write is done —
  // it confirms what's shown, or puts back the truth if a write failed.
  function setItemShares(itemId, update) {
    setItems((current) => current.map((it) => (it.id === itemId ? { ...it, item_shares: update(it.item_shares) } : it)))
  }

  function queueBuyerWrite(itemId, write) {
    const pending = buyerWritesPendingRef.current
    pending.set(itemId, (pending.get(itemId) || 0) + 1)
    enqueueBuyerWrite(itemId, write).then(({ idle, error: writeError }) => {
      const left = pending.get(itemId) - 1
      if (left > 0) pending.set(itemId, left)
      else pending.delete(itemId)
      if (writeError) setError(`Couldn't update who's splitting this item: ${loadErrorMessage(writeError)}`)
      if (idle) refreshItems()
    })
  }

  function toggleBuyer(item, memberId) {
    const has = item.item_shares.some((s) => s.member_id === memberId)
    setItemShares(item.id, (shares) =>
      has ? shares.filter((s) => s.member_id !== memberId) : [...shares, { member_id: memberId, shares: 1 }]
    )
    queueBuyerWrite(item.id, async () => {
      const { error: toggleError } = has
        ? await supabase.from('item_shares').delete().eq('item_id', item.id).eq('member_id', memberId)
        : await supabase.from('item_shares').insert({ item_id: item.id, member_id: memberId, shares: 1 })
      if (toggleError) throw toggleError
    })
  }

  // Double tap on an avatar: that member becomes the item's only buyer
  // (keeping their existing share count, if they already had one).
  function setOnlyBuyer(item, memberId) {
    setItemShares(item.id, (shares) => [shares.find((s) => s.member_id === memberId) || { member_id: memberId, shares: 1 }])
    queueBuyerWrite(item.id, async () => {
      const { error: deleteError } = await supabase
        .from('item_shares')
        .delete()
        .eq('item_id', item.id)
        .neq('member_id', memberId)
      if (deleteError) throw deleteError
      const { error: insertError } = await supabase
        .from('item_shares')
        .upsert(
          { item_id: item.id, member_id: memberId, shares: 1 },
          { onConflict: 'item_id,member_id', ignoreDuplicates: true }
        )
      if (insertError) throw insertError
    })
  }

  // Optimistic: the row disappears on the first tap, so a slow server never
  // looks like "delete didn't work" and invites a second tap (both swipe and
  // the "Remove item" button land here). Repeat taps for a row already being
  // deleted are ignored; on failure the row is put back in its original spot.
  async function deleteItem(itemId) {
    if (deletingIdsRef.current.has(itemId)) return
    const removed = items.find((it) => it.id === itemId)
    deletingIdsRef.current.add(itemId)
    setItems((current) => current.filter((it) => it.id !== itemId))
    setError(null)

    const { error: deleteError } = await supabase.from('items').delete().eq('id', itemId)
    if (deleteError) {
      deletingIdsRef.current.delete(itemId)
      if (removed) {
        setItems((current) =>
          current.some((it) => it.id === itemId)
            ? current
            : [...current, removed].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        )
      }
      setError(`Couldn't remove that item: ${loadErrorMessage(deleteError)}`)
      return
    }
    refreshItems()
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
    refreshItems()
  }

  async function setItemCategory(itemId, categoryId) {
    const { error: updateError } = await supabase
      .from('items')
      .update({ category_id: categoryId || null })
      .eq('id', itemId)
    if (updateError) {
      setError(updateError.message)
      return
    }
    refreshItems()
  }

  return { addItem, addScannedItems, toggleBuyer, setOnlyBuyer, deleteItem, updateItemField, setItemCategory }
}
