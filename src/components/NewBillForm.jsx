import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { parseAmount } from '../lib/parseNumber'
import { ArrowRightIcon } from './icons'

// The group page's "New bill" row. One form, not a choice between two
// (that used to be a per-space Settings toggle — gone now, one form is
// simpler). The Amount field sits on the same line as the title, at a
// quarter of the row's width, and uses the exact same disabled-until-
// there's-a-title fade the submit arrow already does (see
// .row-submit-btn) rather than a separate visibility mechanism — disabled
// doubles as "not worth touching yet" and "not yet visible," so there's
// only one thing to keep in sync, and no layout shift when it fades in
// since its width is always reserved. An amount typed here creates the
// bill with one item already in place (BillView's simple one-item view);
// left blank, it's the exact same zero-item bill "Add bill" has always
// created. `inputRef` lets the page's empty state move you to the title
// field.
export default function NewBillForm({ groupId, userId, myParticipantId, members, onError, inputRef }) {
  const [title, setTitle] = useState('')
  const [amountText, setAmountText] = useState('')

  async function createBill(e) {
    e.preventDefault()
    if (!title.trim()) return
    const trimmed = title.trim()
    const { data, error: createError } = await supabase
      .from('bills')
      .insert({
        group_id: groupId,
        title: trimmed,
        created_by: userId,
        paid_by: myParticipantId,
      })
      .select()
      .single()

    if (createError) {
      onError(createError.message)
      return
    }
    // An amount typed into the Amount field (only reachable once a title's
    // been typed) creates the bill with one item already in place (name
    // mirrors the bill title, so it stays hidden behind BillView's simple
    // one-item view) — same shape BillView's add-item form creates by
    // hand, just done here so the bill lands there already filled in.
    // Leaving it blank creates the bill with no items yet, same as this
    // app has always done — it then expects more than one item, i.e.
    // today's ordinary itemized bill.
    const amount = parseAmount(amountText)
    if (amount) {
      const { data: item, error: itemError } = await supabase
        .from('items')
        .insert({ bill_id: data.id, name: trimmed, unit_price: amount, quantity: 1, total_price: amount })
        .select()
        .single()
      if (itemError) {
        // The bill itself was created fine — only this fast-path item
        // failed to attach. Surfaced as an error and left un-navigated,
        // rather than silently landing on what'd look like an empty,
        // amount-less bill with no explanation for where the typed amount
        // went — the bill's still reachable normally from the list.
        onError(`Bill created, but the amount didn't save: ${itemError.message}`)
        return
      }
      const buyerIds = members.filter((m) => m.active).map((m) => m.id)
      if (item && buyerIds.length) {
        const { error: sharesError } = await supabase
          .from('item_shares')
          .insert(buyerIds.map((id) => ({ item_id: item.id, member_id: id, shares: 1 })))
        // Bill and item both exist and are visible either way — a failure
        // here just leaves that one item unassigned, fixable directly from
        // its own row (see BillView's toggleBuyer), not worth blocking the
        // navigation below over.
        if (sharesError) console.error('Failed to assign new bill item to members:', sharesError.message)
      }
    }
    setTitle('')
    setAmountText('')
    window.location.href = `/groups/${groupId}/bills/${data.id}`
  }

  return (
    <form onSubmit={createBill} className="add-bill-row">
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New bill (e.g. Lidl - Tuesday)"
        aria-label="New bill"
      />
      <input
        value={amountText}
        onChange={(e) => setAmountText(e.target.value)}
        placeholder="Amount"
        inputMode="decimal"
        pattern="[-+*/0-9.,() ]*"
        disabled={!title.trim()}
        className="add-bill-amount-input"
        aria-label="Amount (optional — leave blank to itemize)"
      />
      <button type="submit" className="row-submit-btn" disabled={!title.trim()} aria-label="Add bill">
        <ArrowRightIcon size={16} />
      </button>
    </form>
  )
}
