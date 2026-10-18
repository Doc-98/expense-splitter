import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { toDateInputValue } from '../lib/billDate'
import InlineEditable from './InlineEditable'
import BuyerPicker from './BuyerPicker'
import { ChevronIcon } from './icons'

// The bill page's details panel: note, paid by, category, who the next
// item is split with, and the date. Open by default — its "Next item split
// with" is the default for every item added next, so it should be in plain
// sight before the first item goes in; one tap folds it down to a summary
// line (note, paid by, category, date) to give the receipt the room. Same
// CSS-only grid-rows expand already used elsewhere (Scan Settings'
// provider picker). Saving the note happens here; every other change goes
// back to the page through its own callback.
export default function BillDetails({
  billId,
  bill,
  group,
  billPayers,
  members,
  activeMembers,
  categories,
  defaultBuyerIds,
  showNextItemSplit,
  avatarSize,
  onPaidBySelect,
  onOpenPayers,
  onCategoryChange,
  onToggleDefaultBuyer,
  onOnlyDefaultBuyer,
  onDateSave,
  setError,
}) {
  const [detailsOpen, setDetailsOpen] = useState(true)
  // The note being typed. Takes the bill's own note when a bill first
  // loads (or another one opens), and never again after that — a realtime
  // refresh of the bill must not clobber whatever is being typed.
  const [noteDraft, setNoteDraft] = useState(bill?.note || '')
  const [noteForBillId, setNoteForBillId] = useState(bill?.id)
  if (bill?.id !== noteForBillId) {
    setNoteForBillId(bill?.id)
    setNoteDraft(bill?.note || '')
  }
  const [noteSaved, setNoteSaved] = useState(false)

  const isMultiPayer = billPayers.length > 0
  const nameOf = (id) => members.find((m) => m.id === id)?.name || 'Someone'
  // The "paid by" dropdown always needs an option matching whoever's
  // currently set, even if they've since left the group — otherwise the
  // select would silently show the wrong person.
  const paidByOptions = members.filter((m) => m.active || m.id === bill?.paid_by)

  async function saveNote() {
    const { error: saveError } = await supabase.from('bills').update({ note: noteDraft || null }).eq('id', billId)
    if (saveError) {
      // Without this check, "Saved" showed unconditionally regardless of
      // whether the update actually went through.
      setError(saveError.message)
      return
    }
    setNoteSaved(true)
    setTimeout(() => setNoteSaved(false), 1200)
  }

  // The one-line summary shown when the panel is collapsed — enough to
  // answer "who paid, what category, when, is there a note" without
  // opening it, same reasoning as any progressive-disclosure summary line:
  // show what's usually enough, not everything.
  const billCategory = categories.find((c) => c.id === bill?.category_id)
  const summaryParts = []
  if (group && !group.is_personal) {
    summaryParts.push(isMultiPayer ? `Split ${billPayers.length} ways` : `Paid by ${nameOf(bill?.paid_by)}`)
  }
  summaryParts.push(billCategory ? billCategory.name : 'Uncategorized')
  if (bill) {
    summaryParts.push(new Date(bill.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))
  }
  if (noteDraft.trim()) summaryParts.push('note added')
  const summaryText = summaryParts.join(' · ')

  return (
    <div className={`bill-summary ${detailsOpen ? 'is-open' : ''}`}>
      <button type="button" className="bill-summary-head" onClick={() => setDetailsOpen((o) => !o)}>
        <span className="bill-summary-text">{summaryText}</span>
        <ChevronIcon size={16} className="bill-summary-chev" />
      </button>
      <div className="xwrap">
        <div className="xinner">
          <div className="bill-summary-body">
            <textarea
              className="bill-note"
              placeholder="Add a note — what this was for, who was around that week…"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={saveNote}
              rows={2}
            />
            {noteSaved && <span className="muted note-saved">Saved</span>}

            {/* "Paid by" only ever means something when it could be
                someone other than you — a personal space has exactly one
                member, forever, so every bill is trivially paid by (and
                split with) just them; see NewBillForm.jsx, which already
                defaults paid_by to the creator with no picker involved. */}
            {group && !group.is_personal && (
              <div className="detail-row">
                <span className="detail-row-label">Paid by</span>
                {isMultiPayer ? (
                  <button type="button" className="btn-link" onClick={onOpenPayers}>
                    {billPayers.map((p) => nameOf(p.member_id)).join(', ')} (split)
                  </button>
                ) : (
                  <select value={bill?.paid_by || ''} onChange={(e) => onPaidBySelect(e.target.value)}>
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

            <div className="detail-row">
              <span className="detail-row-label">Category</span>
              <select value={bill?.category_id || ''} onChange={(e) => onCategoryChange(e.target.value)}>
                <option value="">Uncategorized</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Hidden while the bill has a single item: the amount card's
                own "Split with" is the one to use then, and the only way
                to add a next item (Add another item) copies it over — see
                BillView's startItemizing. */}
            {group && !group.is_personal && showNextItemSplit && (
              <div className="detail-row">
                {/* "split with" drops to its own line when the row is
                    too narrow for the whole label. */}
                <span className="detail-row-label next-item-split-label">
                  Next item <span className="nowrap">split with</span>
                </span>
                <BuyerPicker
                  members={activeMembers}
                  selectedIds={defaultBuyerIds}
                  onToggle={onToggleDefaultBuyer}
                  onOnly={onOnlyDefaultBuyer}
                  avatarSize={avatarSize}
                />
              </div>
            )}

            {bill && (
              <div className="detail-row">
                <span className="detail-row-label">Date</span>
                <InlineEditable
                  className="mono item-editable"
                  inputClassName="item-editable-input"
                  inputType="date"
                  value={toDateInputValue(bill.created_at)}
                  display={new Date(bill.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                  onSave={onDateSave}
                  ariaLabel="Bill date"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
