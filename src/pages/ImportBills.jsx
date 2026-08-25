import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../context/CurrencyContext'
import { fetchGroupMembers, addGuest } from '../lib/members'
import { fetchAllRows } from '../lib/fetchAllRows'
import { parseSplitwiseCsv, checkImportBalances } from '../lib/splitwiseImport'
import { splitEvenly } from '../lib/splitEvenly'
import MultiPayerModal from '../components/MultiPayerModal'

// Appended to a review-resolved (or skipped) bill's note, on top of the
// ordinary "Imported from Splitwise (Category)" text — a permanent,
// searchable breadcrumb, so these are still findable through the group's
// own bill search long after this one import session is over, whether or
// not everything ends up matching Splitwise's own numbers.
const REVIEWED_NOTE = 'Splitwise import: reviewed manually'
const SKIPPED_NOTE = 'Splitwise import: needs review — payer not set'

export default function ImportBills() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { format } = useCurrency()

  const [members, setMembers] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [mapping, setMapping] = useState({}) // csvName -> 'new' | participantId
  // 'match' (map Splitwise names to members) -> 'review' (only if anything
  // needs it) -> import runs -> `result` gets set, which gates its own
  // screen the same way `parsed`/`result` already did before this existed.
  const [step, setStep] = useState('match')
  const [resolvedIds, setResolvedIds] = useState(null) // csvName -> real member_id, once resolved
  const [reviewIndex, setReviewIndex] = useState(0)
  const [reviewResolutions, setReviewResolutions] = useState([]) // parallel to parsed.needsReview
  const [reviewPayerModalOpen, setReviewPayerModalOpen] = useState(false)
  const [reviewSplitModalOpen, setReviewSplitModalOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setError(null)
    setResult(null)

    const text = await file.text()
    const parseResult = parseSplitwiseCsv(text)

    if (
      parseResult.expenses.length === 0 &&
      parseResult.needsReview.length === 0 &&
      parseResult.warnings.length > 0 &&
      parseResult.peopleNames.length === 0
    ) {
      setError(parseResult.warnings[0])
      return
    }

    const currentMembers = await fetchGroupMembers(groupId)
    setMembers(currentMembers)

    // Default each detected name to an existing member with a matching
    // name if there's an unambiguous one, otherwise default to creating a
    // new guest for them — saves remapping everyone by hand for the common
    // case where people's names already match.
    const initialMapping = {}
    for (const name of parseResult.peopleNames) {
      const match = currentMembers.find((m) => m.name.toLowerCase() === name.toLowerCase())
      initialMapping[name] = match ? match.id : 'new'
    }

    setMapping(initialMapping)
    setStep('match')
    setReviewIndex(0)
    setReviewResolutions(parseResult.needsReview.map(() => null))
    setResolvedIds(null)
    setParsed(parseResult)
  }

  function updateMapping(name, value) {
    setMapping((m) => ({ ...m, [name]: value }))
  }

  // Turns every "create new guest" mapping choice into a real participant
  // ID, so both the review step below and the final import loop only ever
  // deal in actual IDs, never a Splitwise name that might still map to
  // "new." Idempotent from the caller's point of view — called once, right
  // when leaving the "match people" screen, and its result kept in state.
  async function resolveMapping() {
    const ids = { ...mapping }
    for (const name of parsed.peopleNames) {
      if (mapping[name] === 'new') {
        const created = await addGuest(groupId, name)
        ids[name] = created.id
      }
    }
    setResolvedIds(ids)
    return ids
  }

  async function continueFromMatch() {
    setError(null)
    // Set before resolveMapping() (which does real inserts — creating a
    // guest for every "new" mapping) so the button disables immediately,
    // not just once runImport() eventually gets around to it — a rapid
    // double-click here would otherwise create the same guest twice.
    setImporting(true)
    try {
      const ids = await resolveMapping()
      if (parsed.needsReview.length > 0) {
        setStep('review')
        setImporting(false)
      } else {
        await runImport(ids)
      }
    } catch (err) {
      setError(err.message)
      setImporting(false)
    }
  }

  // "This import's participants" — every Splitwise name resolved to its
  // real member_id, whether that's an existing member or a guest just
  // created for this import. Used for the review step's payer/split
  // pickers instead of the group's pre-existing member list, since a new
  // guest created moments ago by resolveMapping() wouldn't be in that list
  // yet otherwise.
  const reviewParticipants = resolvedIds
    ? parsed.peopleNames.map((name) => ({ id: resolvedIds[name], name })).filter((p) => p.id)
    : []
  const nameOf = (id) => reviewParticipants.find((p) => p.id === id)?.name || 'Someone'

  const currentReviewItem = parsed?.needsReview[reviewIndex]
  // buyerAmounts stays null until "Split unevenly…" is actually used —
  // null means "split buyerIds' share of the cost equally," the same
  // implicit default this always had, just now able to be overridden
  // instead of being the only option. Once set, it's the source of truth
  // (an array of {member_id, amount} — the same shape MultiPayerModal
  // already hands back for payers) and buyerIds just trails along for
  // book-keeping (see toggleReviewBuyer/confirmReviewSplit below).
  const currentResolution = reviewResolutions[reviewIndex] || {
    payerId: null,
    payers: null,
    buyerIds: reviewParticipants.map((p) => p.id),
    buyerAmounts: null,
  }

  function updateCurrentResolution(patch) {
    setReviewResolutions((rs) => {
      const next = [...rs]
      next[reviewIndex] = { ...currentResolution, ...patch }
      return next
    })
  }

  function setReviewPayer(value) {
    if (value === '__multiple__') {
      setReviewPayerModalOpen(true)
      return
    }
    updateCurrentResolution({ payerId: value || null, payers: null })
  }

  function confirmReviewPayers(payers) {
    updateCurrentResolution({ payerId: null, payers })
    setReviewPayerModalOpen(false)
  }

  // Only reachable while there's no custom split yet — the checkbox row
  // this drives is swapped out for a summary button once buyerAmounts is
  // set (see the review step's JSX below), same as the payer picker
  // itself switches to a button once it's gone multi. Clearing
  // buyerAmounts here defensively costs nothing even so: whichever people
  // are actually included changing is exactly what would make an old
  // custom split stale.
  function toggleReviewBuyer(memberId) {
    const current = currentResolution.buyerIds
    const next = current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId]
    updateCurrentResolution({ buyerIds: next, buyerAmounts: null })
  }

  function confirmReviewSplit(amounts) {
    updateCurrentResolution({ buyerAmounts: amounts, buyerIds: amounts.map((a) => a.member_id) })
    setReviewSplitModalOpen(false)
  }

  const currentResolutionHasPayer = Boolean(currentResolution.payerId || currentResolution.payers?.length > 0)
  const currentResolutionHasSplit = Boolean(currentResolution.buyerAmounts?.length > 0 || currentResolution.buyerIds.length > 0)
  const currentResolutionValid = currentResolutionHasPayer && currentResolutionHasSplit

  // What the "Split unevenly…" modal opens pre-filled with — the existing
  // custom split if there is one (editing it further), otherwise an equal
  // split of whoever's currently checked, so adjusting from "even" starts
  // from what's already on screen instead of a blank form.
  const reviewSplitDraft =
    currentResolution.buyerAmounts ||
    (currentReviewItem
      ? currentResolution.buyerIds.map((id, i) => ({
          member_id: id,
          amount: splitEvenly(currentReviewItem.cost, currentResolution.buyerIds.length)[i],
        }))
      : [])

  async function nextReviewItem(skip) {
    const resolutions = [...reviewResolutions]
    resolutions[reviewIndex] = skip ? { skipped: true } : currentResolution
    setReviewResolutions(resolutions)

    if (reviewIndex + 1 < parsed.needsReview.length) {
      setReviewIndex(reviewIndex + 1)
    } else {
      setError(null)
      try {
        await runImport(resolvedIds, resolutions)
      } catch (err) {
        setError(err.message)
      }
    }
  }

  async function runImport(ids, resolutions = reviewResolutions) {
    setImporting(true)
    setError(null)

    // Accumulated locally as bills/items/shares/payers get inserted, so
    // the proof-check below can run computeBalances over exactly what
    // this import just created without a separate round-trip to re-fetch
    // it all back from the database.
    const insertedBills = []
    const insertedItems = []
    const insertedShares = []

    // buyerAmounts is { member_id: amount }, each entry becoming its own
    // item assigned to just that person — not one item covering the whole
    // cost, split by proportional weights. Same shape a hand-entered
    // "everyone bought their own thing" bill already has (see
    // BillView.jsx: item_shares there are always a plain weight of 1 per
    // buyer; unevenness always comes from having separate items, never
    // from weighting shares within one), so an uneven split — Splitwise's
    // own reconstructed shares, or a custom "Split unevenly…" from the
    // review step — is representable at all, and an imported bill ends up
    // just as editable afterward as any other: rename an item, reassign
    // it, adjust its price, right there on the bill's own page.
    async function insertBill({ date, description, category, cost, payerId, payers, buyerAmounts, noteSuffix }) {
      const baseNote = category ? `Imported from Splitwise (${category})` : 'Imported from Splitwise'
      const note = noteSuffix ? `${baseNote} — ${noteSuffix}` : baseNote

      const { data: bill, error: billError } = await supabase
        .from('bills')
        .insert({
          group_id: groupId,
          title: description,
          note,
          paid_by: payerId || null,
          created_by: user.id,
          ...(date ? { created_at: date } : {}),
        })
        .select()
        .single()
      if (billError) throw billError

      const buyerEntries = Object.entries(buyerAmounts || {})
      // Nobody resolved at all (a skipped review item) — still record the
      // bill's full cost as a single unattributed item rather than
      // silently losing it, same as before this existed.
      const itemsToInsert =
        buyerEntries.length > 0
          ? buyerEntries.map(([, amount]) => ({
              bill_id: bill.id,
              name: description,
              unit_price: amount,
              quantity: 1,
              total_price: amount,
            }))
          : [{ bill_id: bill.id, name: description, unit_price: cost, quantity: 1, total_price: cost }]

      // One batch insert for all of this bill's items, relying on Postgres
      // returning a multi-row INSERT...VALUES's RETURNING rows in the same
      // order they were submitted — lets buyerEntries[i] be paired with
      // insertedItemRows[i] below without a round-trip per item.
      const { data: insertedItemRows, error: itemError } = await supabase.from('items').insert(itemsToInsert).select()
      if (itemError) throw itemError

      if (buyerEntries.length > 0) {
        const shareRows = buyerEntries.map(([member_id], i) => ({ item_id: insertedItemRows[i].id, member_id, shares: 1 }))
        const { error: sharesError } = await supabase.from('item_shares').insert(shareRows)
        if (sharesError) throw sharesError
        for (const row of shareRows) insertedShares.push({ item_id: row.item_id, user_id: row.member_id, shares: row.shares })
      }

      let billPayers = []
      if (payers && payers.length > 0) {
        const { error: payersError } = await supabase
          .from('bill_payers')
          .insert(payers.map((p) => ({ bill_id: bill.id, member_id: p.member_id, amount: p.amount })))
        if (payersError) throw payersError
        billPayers = payers
      }

      insertedBills.push({ id: bill.id, paid_by: payerId || null, payers: billPayers })
      for (const row of insertedItemRows) insertedItems.push({ id: row.id, bill_id: bill.id, total_price: row.total_price })
    }

    try {
      let imported = 0

      // The ordinary, automatically-resolved expenses — same shape and
      // logic this always had, just now sharing insertBill() with the
      // review-resolved path below instead of duplicating it. expense.shares
      // is already { name: exact amount }, reconstructed from Splitwise's
      // own net-balance numbers (see splitwiseImport.js) — nothing to
      // compute here beyond resolving names to member ids.
      for (let i = 0; i < parsed.expenses.length; i++) {
        const expense = parsed.expenses[i]
        setProgress(`Importing ${i + 1} of ${parsed.expenses.length + parsed.needsReview.length}…`)

        const payerId = ids[expense.payerName]
        if (!payerId) continue

        const buyerAmounts = {}
        for (const [name, amount] of Object.entries(expense.shares)) {
          const memberId = ids[name]
          if (memberId) buyerAmounts[memberId] = amount
        }

        await insertBill({
          date: expense.date,
          description: expense.description,
          category: expense.category,
          cost: expense.cost,
          payerId,
          payers: null,
          buyerAmounts,
        })
        imported++
      }

      // The ones the review step just resolved (or you chose to skip) —
      // whatever amounts "Split unevenly…" produced, or an equal split of
      // the cost among whoever was checked if that was never opened
      // (splitEvenly rather than plain division, so a 3-way split of an
      // odd number of cents still adds up to exactly the bill total).
      for (let i = 0; i < parsed.needsReview.length; i++) {
        const item = parsed.needsReview[i]
        const resolution = resolutions[i]
        setProgress(`Importing ${parsed.expenses.length + i + 1} of ${parsed.expenses.length + parsed.needsReview.length}…`)

        if (!resolution || resolution.skipped) {
          await insertBill({
            date: item.date,
            description: item.description,
            category: item.category,
            cost: item.cost,
            payerId: null,
            payers: null,
            buyerAmounts: {},
            noteSuffix: SKIPPED_NOTE,
          })
          imported++
          continue
        }

        const buyerAmounts = {}
        if (resolution.buyerAmounts) {
          for (const { member_id, amount } of resolution.buyerAmounts) buyerAmounts[member_id] = amount
        } else if (resolution.buyerIds.length > 0) {
          const amounts = splitEvenly(item.cost, resolution.buyerIds.length)
          resolution.buyerIds.forEach((id, idx) => {
            buyerAmounts[id] = amounts[idx]
          })
        }

        await insertBill({
          date: item.date,
          description: item.description,
          category: item.category,
          cost: item.cost,
          payerId: resolution.payerId,
          payers: resolution.payers,
          buyerAmounts,
          noteSuffix: REVIEWED_NOTE,
        })
        imported++
      }

      // Proof-check against Splitwise's own trailing "Total balance" row,
      // if the export had one — comparing what this import just produced
      // against what Splitwise itself last calculated, so the two either
      // visibly agree or visibly don't rather than silently maybe-not.
      //
      // Folds in this group's existing payments (any settle-up already
      // recorded before this import — including, awkwardly, one left
      // behind by a previous import whose bills were deleted without also
      // checking "delete payments too") rather than checking the fresh
      // bills in isolation. The live Settle Up page always includes every
      // payment in the group; a check that didn't would happily report
      // "matches" here and then visibly disagree with that page the
      // moment you actually look at it — a real, if confusing, way for
      // this to have looked right immediately after import and wrong five
      // minutes later.
      let balanceCheck = null
      if (Object.keys(parsed.finalBalances).length > 0) {
        const existingPayments = await fetchAllRows(() =>
          supabase.from('payments').select('from_member, to_member, amount', { count: 'exact' }).eq('group_id', groupId)
        )
        balanceCheck = checkImportBalances({
          bills: insertedBills,
          items: insertedItems,
          itemShares: insertedShares,
          payments: existingPayments.map((p) => ({ from_user: p.from_member, to_user: p.to_member, amount: p.amount })),
          finalBalances: parsed.finalBalances,
          nameToId: ids,
        })
      }

      setResult({ imported, total: parsed.expenses.length + parsed.needsReview.length, balanceCheck })
      setProgress(null)
    } catch (err) {
      setError(err.message)
      setProgress(null)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <Link to={`/groups/${groupId}`} className="btn-link">
          ← Back
        </Link>
        <h1>Import from Splitwise</h1>
      </header>

      {!parsed && (
        <>
          <p className="muted">
            Export your group from Splitwise as a CSV (Group settings → Export as CSV in Splitwise),
            then upload it here. Each expense becomes one bill, imported with its original date and
            payer preserved. Splitwise doesn't track individual line items, but each person's own
            share becomes its own item, assigned just to them — so an imported bill ends up exactly
            as editable afterward as any other.
          </p>
          <input type="file" accept=".csv,text/csv" onChange={handleFile} />
        </>
      )}

      {error && <p className="status-error">{error}</p>}

      {parsed && !result && step === 'match' && (
        <>
          {parsed.warnings.length > 0 && (
            <div className="status-error">
              {parsed.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          )}

          <h2 className="settings-section-title">
            {parsed.expenses.length} expense{parsed.expenses.length === 1 ? '' : 's'} found
            {parsed.needsReview.length > 0 &&
              `, ${parsed.needsReview.length} need${parsed.needsReview.length === 1 ? 's' : ''} your input`}
          </h2>
          {parsed.needsReview.length > 0 && (
            <p className="muted">
              Splitwise's export doesn't say who paid (or how a multi-payer expense splits) for
              these — you'll be asked one at a time, right after matching people below.
            </p>
          )}

          <h2 className="settings-section-title">Match people</h2>
          <p className="muted">Who does each Splitwise name correspond to in this group?</p>
          {parsed.peopleNames.map((name) => (
            <div key={name} className="import-mapping-row">
              <span>{name}</span>
              <select value={mapping[name]} onChange={(e) => updateMapping(name, e.target.value)}>
                <option value="new">Create new guest "{name}"</option>
                {members?.map((m) => (
                  <option key={m.id} value={m.id}>
                    Use existing: {m.name}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <button type="button" className="btn-primary confirm-btn" onClick={continueFromMatch} disabled={importing}>
            {importing
              ? progress || 'Importing…'
              : parsed.needsReview.length > 0
                ? 'Continue'
                : `Import ${parsed.expenses.length} bills`}
          </button>
        </>
      )}

      {parsed && !result && step === 'review' && currentReviewItem && (
        <>
          <h2 className="settings-section-title">
            Needs your input ({reviewIndex + 1} of {parsed.needsReview.length})
          </h2>
          <p>
            <strong>{currentReviewItem.description}</strong>
            {currentReviewItem.category ? ` — ${currentReviewItem.category}` : ''}
          </p>
          <p className="muted">
            {currentReviewItem.date ? new Date(currentReviewItem.date).toLocaleDateString() : 'Unknown date'} ·{' '}
            <span className="mono">{format(currentReviewItem.cost)}</span>
          </p>

          <div className="paid-by-row">
            <span className="muted">Paid by</span>
            {currentResolution.payers?.length > 0 ? (
              <button type="button" className="btn-link" onClick={() => setReviewPayerModalOpen(true)}>
                {currentResolution.payers.map((p) => nameOf(p.member_id)).join(', ')} (split)
              </button>
            ) : (
              <select value={currentResolution.payerId || ''} onChange={(e) => setReviewPayer(e.target.value)}>
                <option value="">Choose payer…</option>
                {reviewParticipants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value="__multiple__">Multiple payers…</option>
              </select>
            )}
          </div>

          <div className="default-buyers-row">
            <span className="muted">Split with:</span>
            {currentResolution.buyerAmounts ? (
              <button type="button" className="btn-link" onClick={() => setReviewSplitModalOpen(true)}>
                {currentResolution.buyerAmounts.map((a) => nameOf(a.member_id)).join(', ')} (custom split)
              </button>
            ) : (
              <div className="chip-row">
                {reviewParticipants.map((p) => (
                  <label key={p.id} className={currentResolution.buyerIds.includes(p.id) ? 'buyer-chip active' : 'buyer-chip'}>
                    <input
                      type="checkbox"
                      checked={currentResolution.buyerIds.includes(p.id)}
                      onChange={() => toggleReviewBuyer(p.id)}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            )}
            {/* Equal split is the default above — this is the escape hatch
                for when it isn't, same amount-entry modal the payer side
                already uses (see MultiPayerModal.jsx), just for who's
                consuming the bill instead of who fronted it. Needs at
                least two people checked to mean anything. */}
            {!currentResolution.buyerAmounts && currentResolution.buyerIds.length > 1 && (
              <button type="button" className="btn-link" onClick={() => setReviewSplitModalOpen(true)}>
                Split unevenly…
              </button>
            )}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-link" onClick={() => nextReviewItem(true)} disabled={importing}>
              Skip for now
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!currentResolutionValid || importing}
              onClick={() => nextReviewItem(false)}
            >
              {importing ? progress || 'Importing…' : reviewIndex + 1 < parsed.needsReview.length ? 'Next' : 'Finish import'}
            </button>
          </div>

          {reviewPayerModalOpen && (
            <MultiPayerModal
              members={reviewParticipants}
              billTotal={currentReviewItem.cost}
              currentPayers={currentResolution.payers || []}
              onConfirm={confirmReviewPayers}
              onCancel={() => setReviewPayerModalOpen(false)}
            />
          )}

          {reviewSplitModalOpen && (
            <MultiPayerModal
              title="Split this bill"
              members={reviewParticipants}
              billTotal={currentReviewItem.cost}
              currentPayers={reviewSplitDraft}
              onConfirm={confirmReviewSplit}
              onCancel={() => setReviewSplitModalOpen(false)}
            />
          )}
        </>
      )}

      {result && (
        <>
          <p className="status-success">
            Imported {result.imported} of {result.total} bills.
          </p>
          {result.balanceCheck && (
            <>
              {result.balanceCheck.allMatch ? (
                <p className="status-success">
                  Balances match Splitwise's own records for everyone — the import looks correct.
                </p>
              ) : (
                <>
                  <p className="status-error">
                    Some balances don't match Splitwise's own records — worth a manual check before
                    trusting this group's numbers. You can still continue; nothing here is undone
                    automatically.
                  </p>
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th>Person</th>
                        <th>Splitwise says</th>
                        <th>This import came to</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.balanceCheck.rows
                        .filter((r) => !r.matches)
                        .map((r) => (
                          <tr key={r.name}>
                            <td>{r.name}</td>
                            <td className="mono">{format(r.expected)}</td>
                            <td className="mono">{format(r.actual)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}
          <button type="button" className="btn-primary confirm-btn" onClick={() => navigate(`/groups/${groupId}`)}>
            {result.balanceCheck && !result.balanceCheck.allMatch ? 'Continue anyway' : 'Done'}
          </button>
        </>
      )}
    </div>
  )
}
