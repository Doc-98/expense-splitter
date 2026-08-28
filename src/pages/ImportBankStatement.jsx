import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../context/CurrencyContext'
import { fetchAllGroupMembers } from '../lib/members'
import { fetchCategories } from '../lib/categories'
import { fetchAllRows } from '../lib/fetchAllRows'
import { getStatsWindowStart } from '../lib/timeRange'
import { getReceiptSettings } from '../lib/receiptSettings'
import { parseBankStatementCsv } from '../lib/bankStatementCsv'
import {
  parseBankStatementPdf,
  isBankStatementPdfConfigured,
  currentBankStatementStrategyLabel,
} from '../lib/bank-statement-parsing'
import { detectRecurringClusters, findDuplicateIndexes } from '../lib/bankStatementDetection'
import { classifyTitles, resolveClassifyStrategy } from '../lib/billCategorization'
import { advanceDate, addRecurringBill } from '../lib/recurringBills'

const FREQUENCY_LABELS = { weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' }

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function clusterKey(cluster) {
  return `${cluster.description}|${cluster.amount}`
}

export default function ImportBankStatement() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const { format } = useCurrency()

  // 'loading' -> 'landing' -> 'parsing' -> 'review' -> 'done'. No separate
  // 'importing' step — committing is something that happens *from*
  // 'review' (the `importing` boolean below just swaps that step's own
  // editable list for a progress line), not a whole screen of its own.
  // 'landing' also covers the "not available for this group" case (see
  // isPersonal below) — simplest place for it, since it's really just a
  // different landing state, not a whole extra step.
  const [step, setStep] = useState('loading')
  const [error, setError] = useState(null)
  const [isPersonal, setIsPersonal] = useState(null)
  const [myParticipantId, setMyParticipantId] = useState(null)
  const [categories, setCategories] = useState([])

  // Every extracted transaction, CSV or PDF alike, normalized to
  // { date, description, amount, direction }. Never mutated after
  // parsing — everything the review step changes (category, whether to
  // import, whether to set up a recurring template) lives in the
  // parallel state below instead, keyed by index.
  const [transactions, setTransactions] = useState([])
  const [selections, setSelections] = useState([]) // parallel to transactions: { include, categoryId }
  const [duplicateIndexes, setDuplicateIndexes] = useState(new Set())
  const [recurringClusters, setRecurringClusters] = useState([])
  const [recurringChoices, setRecurringChoices] = useState({}) // clusterKey -> boolean
  const [categorizing, setCategorizing] = useState(null) // { done, total } | null, only while the AI category pass runs
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(null)
  const [result, setResult] = useState(null) // { billCount, recurringCount, skippedCount } | null

  const fileInputRef = useRef(null)
  const classifyStrategy = resolveClassifyStrategy()
  const pdfConfigured = isBankStatementPdfConfigured()

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data: groupData, error: groupError } = await supabase
          .from('groups')
          .select('is_personal')
          .eq('id', groupId)
          .single()
        if (groupError) throw groupError
        if (cancelled) return
        setIsPersonal(Boolean(groupData?.is_personal))
        if (!groupData?.is_personal) {
          setStep('landing')
          return
        }

        const [members, categoriesData] = await Promise.all([fetchAllGroupMembers(groupId), fetchCategories(groupId)])
        if (cancelled) return
        setCategories(categoriesData)
        setMyParticipantId(members.find((m) => m.userId === user.id)?.id || null)
        setStep('landing')
      } catch (err) {
        if (cancelled) return
        setError(err.message)
        setStep('landing')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [groupId, user.id])

  // The personal group's own recent bills, in the same
  // { description, amount, date } shape bankStatementDetection.js expects
  // — used to recognize a duplicate or a recurring pattern that spans
  // further back than just this one statement. Windowed the same way
  // GroupView/GroupStats already are (recent history, not the full
  // account lifetime) — plenty for what either check needs, and keeps
  // this from being a second unbounded fetch on an account with years of
  // history.
  async function loadExistingHistory() {
    const windowStart = getStatsWindowStart()
    const bills = await fetchAllRows(() =>
      supabase
        .from('bills')
        .select('title, created_at, items(total_price)', { count: 'exact' })
        .eq('group_id', groupId)
        .gte('created_at', windowStart.toISOString())
    )
    return bills.map((b) => ({
      description: b.title,
      amount: (b.items || []).reduce((sum, it) => sum + Number(it.total_price), 0),
      date: b.created_at,
    }))
  }

  // Runs after the review screen is already up, deliberately not awaited
  // by handleFile — same reasoning as CategorizeBills.jsx not blocking its
  // own review step on the AI pass: someone with no AI configured (or a
  // slow one) still gets a fully usable review immediately, with
  // categories arriving a moment later instead of gating the whole step
  // on them.
  async function runCategorySuggestions(parsedTransactions) {
    if (!classifyStrategy) return
    const debitDescriptions = [...new Set(parsedTransactions.filter((t) => t.direction === 'debit').map((t) => t.description))]
    if (debitDescriptions.length === 0) return

    try {
      const categoryNames = categories.map((c) => c.name)
      const hint = getReceiptSettings().categorizeHint
      setCategorizing({ done: 0, total: debitDescriptions.length })
      const results = await classifyTitles(
        debitDescriptions,
        categoryNames,
        (done, total) => setCategorizing({ done, total }),
        hint
      )
      const nameToId = new Map(categories.map((c) => [c.name, c.id]))
      setSelections((prev) =>
        prev.map((sel, i) => {
          const tx = parsedTransactions[i]
          if (tx.direction !== 'debit' || sel.categoryId) return sel
          const suggested = results.get(tx.description)
          const categoryId = suggested ? nameToId.get(suggested) : null
          return categoryId ? { ...sel, categoryId } : sel
        })
      )
    } catch {
      // A failed AI pass just leaves every row's category exactly where
      // it started — "Uncategorized," pickable by hand — same as having
      // no AI configured at all. Not worth surfacing as a page-level
      // error over what's otherwise a successful import.
    } finally {
      setCategorizing(null)
    }
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setError(null)
    setResult(null)
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    const isCsv = file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv')

    if (!isPdf && !isCsv) {
      setError('That file is neither a PDF nor a CSV — export a statement in one of those formats and try again.')
      return
    }
    if (isPdf && !pdfConfigured) {
      setError(
        'No AI service set up for reading PDF statements — add a Claude or Gemini key in Scan settings, or use a CSV export from your bank instead.'
      )
      return
    }

    setStep('parsing')

    try {
      let parsedTransactions
      if (isCsv) {
        const text = await file.text()
        const { transactions: parsed, warnings } = parseBankStatementCsv(text)
        if (parsed.length === 0) throw new Error(warnings[0] || 'No transactions found in that file.')
        parsedTransactions = parsed
      } else {
        const base64 = await fileToBase64(file)
        parsedTransactions = await parseBankStatementPdf(base64)
        if (parsedTransactions.length === 0) {
          throw new Error('No transactions found — try a clearer export, or a CSV if your bank offers one.')
        }
      }

      const existingHistory = await loadExistingHistory()
      const debitTransactions = parsedTransactions.filter((t) => t.direction === 'debit')

      const duplicates = findDuplicateIndexes(parsedTransactions, existingHistory)
      const clusters = detectRecurringClusters(debitTransactions, existingHistory).map((cluster) => ({
        ...cluster,
        // detectRecurringClusters indexes into debitTransactions, not the
        // full parsedTransactions list this page works with everywhere
        // else — remapped once here so nothing downstream needs to know
        // that distinction exists.
        newTransactionIndexes: cluster.newTransactionIndexes.map((i) => parsedTransactions.indexOf(debitTransactions[i])),
      }))

      // Debits import by default (that's what this app tracks); credits —
      // income, refunds, salary — don't, since they're not spending, but
      // they still show up in the review list rather than vanishing
      // silently. A likely duplicate defaults off regardless of
      // direction, so re-importing an overlapping statement period
      // doesn't double an expense just because nobody unchecked it.
      const initialSelections = parsedTransactions.map((t, i) => ({
        include: t.direction === 'debit' && !duplicates.has(i),
        categoryId: '',
      }))

      setTransactions(parsedTransactions)
      setSelections(initialSelections)
      setDuplicateIndexes(duplicates)
      setRecurringClusters(clusters)
      setRecurringChoices({})
      setStep('review')

      runCategorySuggestions(parsedTransactions)
    } catch (err) {
      setError(err.message)
      setStep('landing')
    }
  }

  function toggleInclude(i) {
    setSelections((prev) => prev.map((s, idx) => (idx === i ? { ...s, include: !s.include } : s)))
  }

  function setCategoryFor(i, categoryId) {
    setSelections((prev) => prev.map((s, idx) => (idx === i ? { ...s, categoryId } : s)))
  }

  function toggleRecurringChoice(key) {
    setRecurringChoices((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  async function insertTransactionAsBill(tx, categoryId) {
    const { data: bill, error: billError } = await supabase
      .from('bills')
      .insert({
        group_id: groupId,
        title: tx.description,
        note: 'Imported from bank statement',
        paid_by: myParticipantId,
        category_id: categoryId || null,
        created_by: user.id,
        created_at: tx.date,
      })
      .select()
      .single()
    if (billError) throw billError

    const { data: item, error: itemError } = await supabase
      .from('items')
      .insert({
        bill_id: bill.id,
        name: tx.description,
        unit_price: tx.amount,
        quantity: 1,
        total_price: tx.amount,
        category_id: categoryId || null,
      })
      .select()
      .single()
    if (itemError) throw itemError

    const { error: shareError } = await supabase
      .from('item_shares')
      .insert({ item_id: item.id, member_id: myParticipantId, shares: 1 })
    if (shareError) throw shareError
  }

  async function commitImport() {
    setImporting(true)
    setError(null)

    const included = transactions
      .map((tx, i) => ({ tx, sel: selections[i], index: i }))
      .filter((x) => x.sel.include)
    setImportProgress({ done: 0, total: included.length })

    try {
      let billCount = 0
      for (const { tx, sel } of included) {
        await insertTransactionAsBill(tx, sel.categoryId)
        billCount++
        setImportProgress({ done: billCount, total: included.length })
      }

      let recurringCount = 0
      for (const cluster of recurringClusters) {
        const key = clusterKey(cluster)
        if (!recurringChoices[key]) continue
        const latest = new Date(cluster.latestDate)
        const nextDue = advanceDate(latest, cluster.frequency, latest.getDate())
        // Whichever category was picked for this cluster's own
        // transactions, if any — they're all the same normalized
        // merchant, so the first one's choice stands in for the group.
        const sampleIndex = cluster.newTransactionIndexes[0]
        const categoryId = sampleIndex != null ? selections[sampleIndex]?.categoryId : null
        await addRecurringBill(supabase, groupId, user.id, {
          title: cluster.description,
          amount: cluster.amount,
          categoryId: categoryId || null,
          paidBy: myParticipantId,
          splitMemberIds: [myParticipantId],
          frequency: cluster.frequency,
          startDate: nextDue,
        })
        recurringCount++
      }

      setResult({ billCount, recurringCount, skippedCount: transactions.length - included.length })
      setStep('done')
    } catch (err) {
      setError(err.message)
    } finally {
      setImporting(false)
      setImportProgress(null)
    }
  }

  const includedCount = selections.filter((s) => s.include).length

  return (
    <div className="page">
      <header className="page-header">
        <Link to={`/groups/${groupId}/settings`} className="btn-link">
          ← Back
        </Link>
        <h1>Import bank statement</h1>
      </header>

      {error && <p className="status-error">{error}</p>}

      {step === 'loading' && <p className="page-loading">Loading…</p>}

      {step !== 'loading' && isPersonal === false && (
        <p className="empty-state">
          Bank statement import is only available for your Personal space right now.{' '}
          <Link to={`/groups/${groupId}`}>Back to this group</Link>
        </p>
      )}

      {step === 'landing' && isPersonal && (
        <>
          <p className="muted">
            Import transactions from a bank or credit-card statement — a CSV export from your bank if it
            offers one (no AI involved, most reliable), or a PDF statement read by whichever AI service
            you've set up in Scan settings.
          </p>
          <p className="status-error">
            Before uploading a PDF: remove or black out anything sensitive it shows beyond the
            transactions themselves — your account number, full name, and address — since it's sent to
            that AI provider to be read.
          </p>
          <p className="muted">
            {pdfConfigured
              ? `PDF statements will be read using: ${currentBankStatementStrategyLabel()}.`
              : 'No AI service configured for PDF statements — set one up in Scan settings, or use a CSV export instead.'}
          </p>
          <button type="button" className="btn-primary" onClick={() => fileInputRef.current?.click()}>
            Choose a statement file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.csv,application/pdf,text/csv"
            onChange={handleFile}
            style={{ display: 'none' }}
          />
        </>
      )}

      {step === 'parsing' && <p className="page-loading">Reading your statement…</p>}

      {step === 'review' && importing && (
        <p className="page-loading">
          Importing… {importProgress ? `${importProgress.done}/${importProgress.total}` : ''}
        </p>
      )}

      {step === 'review' && !importing && (
        <>
          <p>
            <strong>{includedCount}</strong> of <strong>{transactions.length}</strong> transaction
            {transactions.length === 1 ? '' : 's'} will be imported. Untick anything you don't want, tick
            a credit if you actually do want it tracked, and fix any category before confirming — nothing
            is saved until you do.
          </p>
          {categorizing && (
            <p className="muted">
              Asking AI about {categorizing.done} of {categorizing.total} descriptions…
            </p>
          )}

          {recurringClusters.length > 0 && (
            <div>
              <h2 className="settings-section-title">Looks recurring</h2>
              <p className="muted">
                These have shown up on a regular schedule — set one up as a Recurring Bill instead of a
                one-off import, so next time's charge is generated automatically rather than needing
                another statement import.
              </p>
              <ul className="member-list">
                {recurringClusters.map((cluster) => {
                  const key = clusterKey(cluster)
                  return (
                    <li key={key} className="member-list-item">
                      <span className="categorize-row-title">
                        {cluster.description}
                        <span className="muted">
                          {' '}
                          — {format(cluster.amount)}, {FREQUENCY_LABELS[cluster.frequency]} (
                          {cluster.occurrenceCount}x seen)
                        </span>
                      </span>
                      <label className="member-list-actions bank-tx-recurring-toggle">
                        <input
                          type="checkbox"
                          checked={Boolean(recurringChoices[key])}
                          onChange={() => toggleRecurringChoice(key)}
                        />
                        Set up as recurring
                      </label>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          <h2 className="settings-section-title">Transactions</h2>
          <ul className="member-list">
            {transactions.map((tx, i) => (
              <li key={i} className="member-list-item">
                <label className="bank-tx-row">
                  <input
                    type="checkbox"
                    checked={selections[i]?.include || false}
                    disabled={tx.direction === 'credit'}
                    onChange={() => toggleInclude(i)}
                  />
                  <span className="muted bank-tx-date">{new Date(tx.date).toLocaleDateString()}</span>
                  <span className="categorize-row-title">{tx.description}</span>
                  {duplicateIndexes.has(i) && <span className="bank-tx-flag muted">possible duplicate</span>}
                  {tx.direction === 'credit' && <span className="bank-tx-flag muted">income — not imported</span>}
                </label>
                <span className="member-list-actions">
                  <span className="mono">{format(tx.amount)}</span>
                  {tx.direction === 'debit' && (
                    <select
                      className="categorize-row-select"
                      value={selections[i]?.categoryId || ''}
                      onChange={(e) => setCategoryFor(i, e.target.value)}
                    >
                      <option value="">Uncategorized</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  )}
                </span>
              </li>
            ))}
          </ul>

          <button type="button" className="btn-primary confirm-btn" disabled={includedCount === 0} onClick={commitImport}>
            Import {includedCount} transaction{includedCount === 1 ? '' : 's'}
          </button>
        </>
      )}

      {step === 'done' && result && (
        <>
          <p className="status-success">
            Imported {result.billCount} bill{result.billCount === 1 ? '' : 's'}
            {result.recurringCount > 0
              ? `, and set up ${result.recurringCount} recurring bill${result.recurringCount === 1 ? '' : 's'}`
              : ''}
            .{result.skippedCount > 0 ? ` ${result.skippedCount} transaction${result.skippedCount === 1 ? ' was' : 's were'} left out.` : ''}
          </p>
          <Link to={`/groups/${groupId}`} className="btn-primary confirm-btn">
            Done
          </Link>
        </>
      )}
    </div>
  )
}
