import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { fetchGroupMembers, addGuest } from '../lib/members'
import { parseSplitwiseCsv } from '../lib/splitwiseImport'

export default function ImportBills() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [members, setMembers] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [mapping, setMapping] = useState({}) // csvName -> 'new' | participantId
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

    if (parseResult.expenses.length === 0 && parseResult.warnings.length > 0 && parseResult.peopleNames.length === 0) {
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
    setParsed(parseResult)
  }

  function updateMapping(name, value) {
    setMapping((m) => ({ ...m, [name]: value }))
  }

  async function runImport() {
    if (!parsed) return
    setImporting(true)
    setError(null)

    try {
      // Resolve every "create new guest" choice to a real participant ID
      // first, so the bill-creation loop below only ever deals with IDs.
      const resolvedIds = { ...mapping }
      for (const name of parsed.peopleNames) {
        if (mapping[name] === 'new') {
          const created = await addGuest(groupId, name)
          resolvedIds[name] = created.id
        }
      }

      let imported = 0
      for (let i = 0; i < parsed.expenses.length; i++) {
        const expense = parsed.expenses[i]
        setProgress(`Importing ${i + 1} of ${parsed.expenses.length}…`)

        const payerId = resolvedIds[expense.payerName]
        if (!payerId) continue

        const note = expense.category ? `Imported from Splitwise (${expense.category})` : 'Imported from Splitwise'

        const { data: bill, error: billError } = await supabase
          .from('bills')
          .insert({
            group_id: groupId,
            title: expense.description,
            note,
            paid_by: payerId,
            created_by: user.id,
            ...(expense.date ? { created_at: expense.date } : {}),
          })
          .select()
          .single()
        if (billError) throw billError

        const { data: item, error: itemError } = await supabase
          .from('items')
          .insert({
            bill_id: bill.id,
            name: expense.description,
            unit_price: expense.cost,
            quantity: 1,
            total_price: expense.cost,
          })
          .select()
          .single()
        if (itemError) throw itemError

        const shareRows = Object.entries(expense.shares)
          .map(([name, amount]) => ({ item_id: item.id, member_id: resolvedIds[name], shares: amount }))
          .filter((row) => row.member_id)

        if (shareRows.length > 0) {
          const { error: sharesError } = await supabase.from('item_shares').insert(shareRows)
          if (sharesError) throw sharesError
        }

        imported++
      }

      setResult({ imported, total: parsed.expenses.length })
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
            payer preserved — Splitwise doesn't track individual line items the way this app does, so
            each import is a single-item bill covering the whole expense.
          </p>
          <input type="file" accept=".csv,text/csv" onChange={handleFile} />
        </>
      )}

      {error && <p className="status-error">{error}</p>}

      {parsed && !result && (
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
          </h2>

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

          <button type="button" className="btn-primary confirm-btn" onClick={runImport} disabled={importing}>
            {importing ? progress || 'Importing…' : `Import ${parsed.expenses.length} bills`}
          </button>
        </>
      )}

      {result && (
        <>
          <p className="status-success">
            Imported {result.imported} of {result.total} bills.
          </p>
          <button type="button" className="btn-primary confirm-btn" onClick={() => navigate(`/groups/${groupId}`)}>
            Done
          </button>
        </>
      )}
    </div>
  )
}
