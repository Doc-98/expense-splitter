import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../context/CurrencyContext'
import { fetchAllGroupMembers } from '../lib/members'
import { fetchCategories } from '../lib/categories'
import { fetchAllRows } from '../lib/fetchAllRows'
import { getStatsWindowStart } from '../lib/timeRange'
import { getReceiptSettings, setReceiptSettings } from '../lib/receiptSettings'
import { parseBankStatementCsv } from '../lib/bankStatementCsv'
import { parseBankStatementXlsx } from '../lib/bankStatementXlsx'
import {
  parseBankStatementPdf,
  isBankStatementPdfConfigured,
  currentBankStatementStrategyLabel,
} from '../lib/bank-statement-parsing'
import { isColumnDetectionAvailable } from '../lib/bankStatementColumns'
import { findDuplicateIndexes, findCrossGroupMatches } from '../lib/bankStatementDetection'
import { classifyTitles, resolveClassifyStrategy } from '../lib/billCategorization'
import { fetchDraft, createDraft, updateDraftReview, deleteDraft } from '../lib/bankImportDrafts'
import { getBankCategoryMappings, saveBankCategoryMappings } from '../lib/bankCategoryMappings'
import { initialReviewEntry, resolveCategoryHints } from '../lib/bankStatementReview'
import InlineEditable from '../components/InlineEditable'

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function ImportBankStatement() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const { format } = useCurrency()

  // 'loading' -> 'landing' -> 'parsing' -> 'review' -> 'done', with
  // 'draft-found' inserted between 'loading' and 'landing' whenever a
  // previous import was left unfinished (see bank_import_drafts) — the
  // one-at-a-time review step this page builds up to means an unfinished
  // import is the normal, expected case for anyone who didn't get through
  // a long statement in one sitting, not an edge case to just paper over.
  // 'match-categories' is inserted between 'parsing' and 'review' whenever
  // the statement's own category column has a bank category name this
  // group hasn't been matched to a real category before (see
  // proceedAfterParse/resolveCategoryHints) — skipped entirely for a file
  // with no category column, or once every name it has has been matched
  // before.
  const [step, setStep] = useState('loading')
  const [error, setError] = useState(null)
  const [isPersonal, setIsPersonal] = useState(null)
  const [myParticipantId, setMyParticipantId] = useState(null)
  const [categories, setCategories] = useState([])

  const [draftId, setDraftId] = useState(null)
  // Every extracted transaction, CSV/Excel/PDF alike, normalized to
  // { date, description, amount, direction }. Immutable for the life of a
  // draft/review pass — everything the review step changes lives in
  // `review` below instead, keyed by the same index.
  const [transactions, setTransactions] = useState([])
  // Parallel to transactions — see initialReviewEntry above for the
  // shape. `description` is `undefined` until the user actually edits
  // that row — everywhere it's read, it falls back to the parsed
  // transaction's own description, so an untouched row costs nothing and
  // isn't treated as "edited."
  const [review, setReview] = useState([])
  const [duplicateIndexes, setDuplicateIndexes] = useState(new Set())
  const [crossGroupMatches, setCrossGroupMatches] = useState(new Map()) // transaction index -> groupName
  // Position within the *reviewable* (debit-only) subset — see
  // reviewableIndexes below. Moves by exactly one per confirmed Back/Next,
  // never by directly jumping, so it always reflects "how far into this
  // pass you actually are," resumable exactly where you left off.
  const [currentPosition, setCurrentPosition] = useState(0)
  const [committing, setCommitting] = useState(false) // true while a Back/Next's own insert-or-update round trip is in flight
  const [categorizing, setCategorizing] = useState(null) // { done, total } | null, only while the AI category pass runs
  const [parseNotices, setParseNotices] = useState([]) // non-fatal notices from parsing itself, e.g. an AI column-detection disagreement
  const [result, setResult] = useState(null) // { billCount, skippedCount } | null
  // Unlike the PDF path (needs AI by design) and category suggestions
  // (already opt-in via whether an AI service is configured at all), the
  // CSV/Excel column-detection double-check is independently opt-outable
  // even when a service *is* configured — someone temporarily out of API
  // quota, or who'd rather not send transaction data to that provider for
  // this specific check, can turn just this one thing off. See
  // bankStatementColumns/index.js's isColumnDetectionEnabled(), which this
  // setting feeds.
  const [aiColumnCheckEnabled, setAiColumnCheckEnabled] = useState(
    () => getReceiptSettings().bankStatementAiColumnCheck !== false
  )
  // The "bring your own AI chat" path's own paste box (see
  // handlePastedCsv) and the copy-feedback for its prompt button.
  const [pastedCsv, setPastedCsv] = useState('')
  const [promptCopied, setPromptCopied] = useState(false)

  // The 'match-categories' step's own state — see resolveCategoryHints and
  // proceedAfterParse below. pendingImport holds the already-parsed file
  // (transactions/notices/history-fetch) while that step is up, since
  // parsing already finished by the time it's known this step is even
  // needed; null the rest of the time, including once the step's own
  // Continue hands off to processParsedTransactions.
  const [pendingImport, setPendingImport] = useState(null) // { parsedTransactions, notices, existingHistoryPromise } | null
  const [resolvedHints, setResolvedHints] = useState(new Map()) // lowercase bank category -> categoryId | null, the half already known
  const [unresolvedHints, setUnresolvedHints] = useState([]) // [{ key, label, count }], the half this step is asking about
  const [categoryChoices, setCategoryChoices] = useState({}) // key -> categoryId, this step's own in-progress form state

  const fileInputRef = useRef(null)
  const classifyStrategy = resolveClassifyStrategy()
  const pdfConfigured = isBankStatementPdfConfigured()
  const columnCheckAvailable = isColumnDetectionAvailable()
  // Lowercased category name -> id, for resolving a CSV's own category
  // hint (see initialReviewEntry) back to a real category in this group —
  // built once per categories load rather than re-scanning the array per
  // transaction.
  const categoryNameToId = useMemo(() => new Map(categories.map((c) => [c.name.toLowerCase(), c.id])), [categories])

  // For anyone without Claude/Gemini API access set up here — a Claude Pro
  // subscriber with no API tokens, say — but who'd still like AI help:
  // copy this into whichever AI chat app they already use, alongside their
  // own redacted statement, and paste back the CSV it produces (see
  // handlePastedCsv). Asks for the group's own real category names
  // specifically, using the exact "Category" column bankStatementRows.js
  // already recognizes, so a guess round-trips straight back into
  // categoryId without a second, separate classification pass once it's
  // pasted in.
  const byoAiPrompt = useMemo(() => {
    const categoryList = categories.map((c) => c.name).join(', ')
    return `You are reading a bank or credit-card statement for me, to import into an expense-tracking app. I've already removed or blacked out anything sensitive beyond the transactions themselves.

For every real transaction in the statement (skip running balances, page headers, and anything that isn't an actual transaction), give me:
- Date, in YYYY-MM-DD format.
- A short description — the merchant or payee, not the bank's full reference-number-laden text.
- Amount, as a plain number with no currency symbol — negative for money spent, positive for money received (a refund, a deposit, income).
- Your best-guess category, chosen ONLY from this exact list: ${categoryList}. Make your best guess even when you're not fully sure — I'll review every single one myself and can correct it, so a plausible guess is more useful to me than leaving it blank. Only leave it empty when truly nothing on the list is even a reasonable fit. The statement may be in any language — that's fine, categorize based on what the transaction actually is.

Output ONLY a CSV with this exact header row and nothing else — no explanation before or after, no markdown code fence, no extra columns:
Date,Description,Amount,Category`
  }, [categories])

  function copyByoAiPrompt() {
    navigator.clipboard
      .writeText(byoAiPrompt)
      .then(() => {
        setPromptCopied(true)
        setTimeout(() => setPromptCopied(false), 2000)
      })
      .catch(() => setError('Could not copy automatically — select and copy the prompt text by hand instead.'))
  }

  function toggleAiColumnCheck() {
    const next = !aiColumnCheckEnabled
    setReceiptSettings({ bankStatementAiColumnCheck: next })
    setAiColumnCheckEnabled(next)
  }

  // A credit (salary, a refund) is never importable, so it's never given
  // its own review card at all — reviewableIndexes is the ordered list of
  // *raw* transaction indexes that actually go through the one-at-a-time
  // flow, and currentPosition is a position within this array, not into
  // transactions directly.
  const reviewableIndexes = useMemo(
    () => transactions.map((_, i) => i).filter((i) => transactions[i].direction === 'debit'),
    [transactions]
  )
  const totalReviewable = reviewableIndexes.length
  const rawIndex = currentPosition < totalReviewable ? reviewableIndexes[currentPosition] : null
  const currentTx = rawIndex != null ? transactions[rawIndex] : null
  const currentEntry = rawIndex != null ? review[rawIndex] : null

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

        const [members, categoriesData, draft] = await Promise.all([
          fetchAllGroupMembers(groupId),
          fetchCategories(groupId),
          fetchDraft(groupId),
        ])
        if (cancelled) return
        setCategories(categoriesData)
        setMyParticipantId(members.find((m) => m.userId === user.id)?.id || null)

        if (draft) {
          setDraftId(draft.id)
          setTransactions(draft.transactions)
          setReview(draft.review)
          setDuplicateIndexes(draft.duplicateIndexes)
          setCrossGroupMatches(draft.crossGroupMatches)
          setCurrentPosition(draft.currentPosition)
          setStep('draft-found')
        } else {
          setStep('landing')
        }
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
  // — used to recognize a duplicate that spans further back than just
  // this one statement. Windowed the same way GroupView/GroupStats
  // already are (recent history, not the full account lifetime) — plenty
  // for what the check needs, and keeps this from being a second
  // unbounded fetch on an account with years of history.
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

  // The same real-world expense can already be sitting in one of the
  // account's *other* groups — you paid for something with a friend, and
  // now it's also showing up on your own bank statement. Unlike
  // loadExistingHistory above (a broad recent window, since it's only one
  // group), this is scoped tightly to the statement's own date range,
  // padded by the same wiggle room findCrossGroupMatches itself checks —
  // "trust the date match" — no reason to search further than that wiggle
  // room could ever match anyway, across however many other groups the
  // account belongs to.
  const CROSS_GROUP_WINDOW_DAYS = 3

  async function loadCrossGroupBills(transactionDates) {
    if (transactionDates.length === 0) return []

    const times = transactionDates.map((d) => new Date(d).getTime())
    const padMs = CROSS_GROUP_WINDOW_DAYS * 24 * 60 * 60 * 1000
    const rangeStart = new Date(Math.min(...times) - padMs)
    const rangeEnd = new Date(Math.max(...times) + padMs)

    const { data: memberships, error: membershipError } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id)
      .eq('active', true)
    if (membershipError) throw membershipError

    const otherGroupIds = [...new Set((memberships || []).map((m) => m.group_id))].filter((id) => id !== groupId)
    if (otherGroupIds.length === 0) return []

    // Neither of these needs the other's result — both only need
    // otherGroupIds — so there's no reason to make one wait on the other.
    const [{ data: groupsData, error: groupsError }, bills] = await Promise.all([
      supabase.from('groups').select('id, name').in('id', otherGroupIds),
      fetchAllRows(() =>
        supabase
          .from('bills')
          .select('group_id, created_at, items(total_price)', { count: 'exact' })
          .in('group_id', otherGroupIds)
          .gte('created_at', rangeStart.toISOString())
          .lte('created_at', rangeEnd.toISOString())
      ),
    ])
    if (groupsError) throw groupsError
    const groupNameById = new Map((groupsData || []).map((g) => [g.id, g.name]))

    return bills.map((b) => ({
      amount: (b.items || []).reduce((sum, it) => sum + Number(it.total_price), 0),
      date: b.created_at,
      groupName: groupNameById.get(b.group_id) || 'another group',
    }))
  }

  // Runs after the review screen is already up, deliberately not awaited
  // by handleFile — same reasoning as CategorizeBills.jsx not blocking its
  // own review step on the AI pass: someone with no AI configured (or a
  // slow one) still gets a fully usable review immediately, with
  // categories arriving a moment later instead of gating the whole step
  // on them. Suggestions are persisted to the draft as they arrive (not
  // just kept in local state) so closing the tab right after uploading —
  // before reviewing even the first card — doesn't throw away AI work
  // already done and cost it again on resume.
  //
  // Also called again on resumeDraft() below, in case a pause landed
  // mid-pass — skips any transaction that already has a category *or* is
  // already reviewed, so this is always a no-op once a first pass
  // actually finished, and — critically — never overwrites an
  // already-committed bill's category with a late suggestion arriving
  // after the fact; a reviewed entry's category is done changing outside
  // of Back explicitly revisiting it.
  async function runCategorySuggestions(parsedTransactions, currentReview, currentDraftId) {
    if (!classifyStrategy) return
    const pendingIndexes = parsedTransactions
      .map((t, i) => i)
      .filter((i) => parsedTransactions[i].direction === 'debit' && !currentReview[i]?.reviewed && !currentReview[i]?.categoryId)
    const debitDescriptions = [...new Set(pendingIndexes.map((i) => parsedTransactions[i].description))]
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
      setReview((prev) => {
        const next = prev.map((entry, i) => {
          const tx = parsedTransactions[i]
          if (tx.direction !== 'debit' || entry.reviewed || entry.categoryId) return entry
          const suggested = results.get(tx.description)
          const categoryId = suggested ? nameToId.get(suggested) : null
          return categoryId ? { ...entry, categoryId } : entry
        })
        updateDraftReview(currentDraftId, { review: next }).catch(() => {
          // Suggestions still show for the rest of this session even if
          // the draft write failed — a resume just wouldn't have them
          // pre-filled, same as if no AI were configured at all.
        })
        return next
      })
    } catch {
      // A failed AI pass just leaves every row's category exactly where
      // it started — "Uncategorized," pickable by hand — same as having
      // no AI configured at all. Not worth surfacing as a page-level
      // error over what's otherwise a successful import.
    } finally {
      setCategorizing(null)
    }
  }

  // Shared by every input path once it's produced a plain parsed-
  // transaction list — handleFile (PDF/CSV/Excel) and handlePastedCsv (the
  // "bring your own AI chat" path below) both call this once they've done
  // their own format-specific parsing (by way of proceedAfterParse, which
  // decides whether the "Match bank categories" step needs to run first).
  // existingHistoryPromise is passed in rather than started here so a
  // caller that can kick it off earlier (alongside its own parse) still
  // gets that benefit — see handleFile. hintCategoryMap is
  // resolveCategoryHints' own `resolved` map, already fully answered by
  // the time this runs — defaults to empty for a file with no category
  // column at all, the ordinary case.
  async function processParsedTransactions(parsedTransactions, notices, existingHistoryPromise, hintCategoryMap = new Map()) {
    const [existingHistory, crossGroupBills] = await Promise.all([
      existingHistoryPromise,
      loadCrossGroupBills(parsedTransactions.map((t) => t.date)),
    ])

    const duplicates = findDuplicateIndexes(parsedTransactions, existingHistory)
    const crossMatches = findCrossGroupMatches(parsedTransactions, crossGroupBills)

    // A file that's entirely credits (a pure income/refund statement,
    // say) has nothing reviewable at all — no draft worth creating for
    // zero cards, straight to a "done" screen reporting everything as
    // left out.
    if (!parsedTransactions.some((t) => t.direction === 'debit')) {
      setParseNotices(notices)
      setResult({ billCount: 0, skippedCount: parsedTransactions.length })
      setStep('done')
      return
    }

    // Debits are reviewed (that's what this app tracks); credits —
    // income, refunds, salary — never get a card at all, since they can
    // never be imported either way (see reviewableIndexes). A likely
    // duplicate — this same statement re-imported, or this same expense
    // already recorded in another group — defaults off, so nobody
    // accidentally double-counts just because they didn't notice the
    // flag; still fully reviewable, in case it's a false positive.
    const initialReview = parsedTransactions.map((t, i) => initialReviewEntry(t, duplicates, crossMatches, i, hintCategoryMap))

    const newDraftId = await createDraft(groupId, user.id, {
      transactions: parsedTransactions,
      review: initialReview,
      duplicateIndexes: duplicates,
      crossGroupMatches: crossMatches,
    })

    setDraftId(newDraftId)
    setTransactions(parsedTransactions)
    setReview(initialReview)
    setDuplicateIndexes(duplicates)
    setCrossGroupMatches(crossMatches)
    setCurrentPosition(0)
    setParseNotices(notices)
    setStep('review')

    runCategorySuggestions(parsedTransactions, initialReview, newDraftId)
  }

  // The one thing every parse path (handleFile, handlePastedCsv) does
  // before handing off to processParsedTransactions: decide whether any of
  // this statement's own category hints still need a person's input. Most
  // imports have no category column at all (resolveCategoryHints just
  // returns nothing unresolved) and skip straight through, same as before
  // this step existed; a real bank export with its own category column
  // almost always has *something* unresolved the first time (its wording
  // essentially never matches this app's category names, often not even
  // its language) — that's what the "Match bank categories" step is for.
  async function proceedAfterParse(parsedTransactions, notices, existingHistoryPromise) {
    const { resolved, unresolved } = resolveCategoryHints(
      parsedTransactions,
      categoryNameToId,
      getBankCategoryMappings(groupId)
    )
    if (unresolved.size > 0) {
      setPendingImport({ parsedTransactions, notices, existingHistoryPromise })
      setResolvedHints(resolved)
      setUnresolvedHints([...unresolved.entries()].map(([key, v]) => ({ key, ...v })))
      setCategoryChoices(Object.fromEntries([...unresolved.keys()].map((k) => [k, ''])))
      setStep('match-categories')
      return
    }
    await processParsedTransactions(parsedTransactions, notices, existingHistoryPromise, resolved)
  }

  function updateCategoryChoice(key, categoryId) {
    setCategoryChoices((prev) => ({ ...prev, [key]: categoryId }))
  }

  // "Continue" on the "Match bank categories" step — folds this round's
  // choices into resolvedHints (a blank choice becomes null: "leave
  // uncategorized," a real answer same as any other resolved hint, see
  // resolveCategoryHints), persists them for next time this bank's own
  // category names show up (saveBankCategoryMappings — one write for the
  // whole batch, not one per hint), then hands the already-parsed file off
  // to processParsedTransactions exactly like a file with nothing to ask
  // about would have gone straight there.
  async function confirmCategoryMapping() {
    if (!pendingImport) return
    const chosen = {}
    const combined = new Map(resolvedHints)
    for (const { key } of unresolvedHints) {
      const categoryId = categoryChoices[key] || null
      chosen[key] = categoryId
      combined.set(key, categoryId)
    }
    saveBankCategoryMappings(groupId, chosen)

    const { parsedTransactions, notices, existingHistoryPromise } = pendingImport
    setPendingImport(null)
    setUnresolvedHints([])
    setCategoryChoices({})
    await processParsedTransactions(parsedTransactions, notices, existingHistoryPromise, combined)
  }

  function cancelCategoryMapping() {
    setPendingImport(null)
    setResolvedHints(new Map())
    setUnresolvedHints([])
    setCategoryChoices({})
    setStep('landing')
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setError(null)
    setResult(null)
    setParseNotices([])
    const lowerName = file.name.toLowerCase()
    const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf')
    const isCsv = file.type === 'text/csv' || lowerName.endsWith('.csv')
    const isXlsx =
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.type === 'application/vnd.ms-excel' ||
      lowerName.endsWith('.xlsx') ||
      lowerName.endsWith('.xls')

    if (!isPdf && !isCsv && !isXlsx) {
      setError('That file is neither a PDF, CSV, nor Excel file — export a statement in one of those formats and try again.')
      return
    }
    if (isPdf && !pdfConfigured) {
      setError(
        'No AI service set up for reading PDF statements — add a Claude or Gemini key in Scan settings, or use a CSV export from your bank instead.'
      )
      return
    }

    setStep('parsing')

    // Kicked off immediately, alongside the parse below rather than after
    // it — this fetch only depends on the fixed stats window (see
    // getStatsWindowStart), not on anything the parse itself produces, so
    // there's no reason to make it wait in line behind however long
    // reading the file takes. Its rejection is still caught below (via
    // the Promise.all it's awaited in), same as if it had been started
    // there to begin with.
    const existingHistoryPromise = loadExistingHistory()

    try {
      let parsedTransactions
      let notices = []
      if (isCsv) {
        const text = await file.text()
        const { transactions: parsed, warnings } = await parseBankStatementCsv(text)
        if (parsed.length === 0) throw new Error(warnings[0] || 'No transactions found in that file.')
        parsedTransactions = parsed
        notices = warnings
      } else if (isXlsx) {
        const { transactions: parsed, warnings } = await parseBankStatementXlsx(file)
        if (parsed.length === 0) throw new Error(warnings[0] || 'No transactions found in that file.')
        parsedTransactions = parsed
        notices = warnings
      } else {
        const base64 = await fileToBase64(file)
        parsedTransactions = await parseBankStatementPdf(base64)
        if (parsedTransactions.length === 0) {
          throw new Error('No transactions found — try a clearer export, or a CSV if your bank offers one.')
        }
      }

      await proceedAfterParse(parsedTransactions, notices, existingHistoryPromise)
    } catch (err) {
      setError(err.message)
      setStep('landing')
    }
  }

  // The "bring your own AI chat" path — someone without Claude/Gemini API
  // access (a Claude Pro subscriber with no API tokens, say) copies
  // byoAiPrompt below into whichever chat app they already use, attaches
  // their own redacted statement there, and pastes the CSV it hands back
  // here. From here on this is indistinguishable from an ordinary CSV
  // upload — same parseBankStatementCsv, same column detection, same
  // (optional) AI double-check if one's configured for that too — the
  // only difference is where the text came from.
  async function handlePastedCsv() {
    const text = pastedCsv.trim()
    if (!text) return

    setError(null)
    setResult(null)
    setParseNotices([])
    setStep('parsing')

    try {
      const { transactions: parsed, warnings } = await parseBankStatementCsv(text)
      if (parsed.length === 0) throw new Error(warnings[0] || "That doesn't look like a CSV with any transactions in it.")
      await proceedAfterParse(parsed, warnings, loadExistingHistory())
      setPastedCsv('')
    } catch (err) {
      setError(err.message)
      setStep('landing')
    }
  }

  function updateCurrentEntry(patch) {
    if (rawIndex == null) return
    setReview((prev) => prev.map((entry, idx) => (idx === rawIndex ? { ...entry, ...patch } : entry)))
  }

  // A bank's own wording ("AMAZON MKTPLACE PMTS*UK 123456") often isn't
  // what you'd want sitting as a bill title — falls back to the parsed
  // description untouched when the user hasn't edited it.
  function descriptionForEntry(tx, entry) {
    return entry?.description ?? tx?.description
  }

  // Inserts a bill/item/item_share the first time a transaction is
  // confirmed with include: true; updates those same rows on every
  // subsequent confirm instead (Back, edit something, Next again) — see
  // bank_import_drafts' own comment in schema.sql for why this matters:
  // an already-committed transaction is a real bill the moment you move
  // past it, and going back to fix a mistake should fix that bill, not
  // create a second one alongside it.
  async function upsertBillForEntry(tx, entry) {
    const description = descriptionForEntry(tx, entry)

    if (entry.billId) {
      const { error: billError } = await supabase
        .from('bills')
        .update({ title: description, category_id: entry.categoryId || null, created_at: tx.date })
        .eq('id', entry.billId)
      if (billError) throw billError

      const { error: itemError } = await supabase
        .from('items')
        .update({ name: description, unit_price: tx.amount, total_price: tx.amount, category_id: entry.categoryId || null })
        .eq('id', entry.itemId)
      if (itemError) throw itemError

      return { billId: entry.billId, itemId: entry.itemId }
    }

    const { data: bill, error: billError } = await supabase
      .from('bills')
      .insert({
        group_id: groupId,
        title: description,
        note: 'Imported from bank statement',
        paid_by: myParticipantId,
        category_id: entry.categoryId || null,
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
        name: description,
        unit_price: tx.amount,
        quantity: 1,
        total_price: tx.amount,
        category_id: entry.categoryId || null,
      })
      .select()
      .single()
    if (itemError) throw itemError

    const { error: shareError } = await supabase
      .from('item_shares')
      .insert({ item_id: item.id, member_id: myParticipantId, shares: 1 })
    if (shareError) throw shareError

    return { billId: bill.id, itemId: item.id }
  }

  // The bill created for an entry that was included, then un-included
  // after going Back — deleting the bill cascades to its item and
  // item_share (schema.sql), so this is the one call needed to fully
  // retract it.
  async function deleteBillForEntry(billId) {
    const { error } = await supabase.from('bills').delete().eq('id', billId)
    if (error) throw error
  }

  // Confirms whatever the current card's state is (insert, update, or
  // retract its bill, matching include/billId) and persists both the
  // updated review array and the new position to the draft — called by
  // both Back and Next, since either one can be leaving behind an edit
  // that hasn't been saved yet. Returns the updated review array so the
  // caller can compute a final tally once the pass is actually done.
  async function confirmCurrentCard(nextPosition) {
    if (rawIndex == null) return review
    const entry = review[rawIndex]
    const tx = transactions[rawIndex]

    let updatedEntry
    if (entry.include) {
      const { billId, itemId } = await upsertBillForEntry(tx, entry)
      updatedEntry = { ...entry, billId, itemId, reviewed: true }
    } else if (entry.billId) {
      await deleteBillForEntry(entry.billId)
      updatedEntry = { ...entry, billId: null, itemId: null, reviewed: true }
    } else {
      updatedEntry = { ...entry, reviewed: true }
    }

    const nextReview = review.map((e, idx) => (idx === rawIndex ? updatedEntry : e))
    setReview(nextReview)
    await updateDraftReview(draftId, { review: nextReview, currentPosition: nextPosition })
    return nextReview
  }

  async function goNext() {
    setCommitting(true)
    setError(null)
    try {
      const finished = currentPosition + 1 >= totalReviewable
      const nextReview = await confirmCurrentCard(finished ? currentPosition : currentPosition + 1)
      if (finished) {
        await deleteDraft(draftId)
        const billCount = reviewableIndexes.filter((i) => nextReview[i].billId).length
        setDraftId(null)
        setResult({ billCount, skippedCount: transactions.length - billCount })
        setStep('done')
      } else {
        setCurrentPosition(currentPosition + 1)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setCommitting(false)
    }
  }

  async function goBack() {
    if (currentPosition === 0) return
    setCommitting(true)
    setError(null)
    try {
      await confirmCurrentCard(currentPosition - 1)
      setCurrentPosition(currentPosition - 1)
    } catch (err) {
      setError(err.message)
    } finally {
      setCommitting(false)
    }
  }

  async function discardDraft() {
    setError(null)
    try {
      await deleteDraft(draftId)
      setDraftId(null)
      setTransactions([])
      setReview([])
      setDuplicateIndexes(new Set())
      setCrossGroupMatches(new Map())
      setCurrentPosition(0)
      setStep('landing')
    } catch (err) {
      setError(err.message)
    }
  }

  function resumeDraft() {
    setStep('review')
    runCategorySuggestions(transactions, review, draftId)
  }

  const reviewedCount = reviewableIndexes.filter((i) => review[i]?.reviewed).length

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

      {step === 'draft-found' && (
        <>
          <p className="muted">
            You have an unfinished bank statement import — {reviewedCount} of {totalReviewable} transaction
            {totalReviewable === 1 ? '' : 's'} reviewed. Resume where you left off, or discard it to start a
            new import instead.
          </p>
          <button type="button" className="btn-primary confirm-btn" onClick={resumeDraft}>
            Resume ({totalReviewable - reviewedCount} left)
          </button>
          <button type="button" className="btn-link" onClick={discardDraft}>
            Discard this import and start over
          </button>
        </>
      )}

      {step === 'landing' && isPersonal && (
        <>
          <p className="muted">
            Import transactions from a bank or credit-card statement — a CSV or Excel export from your
            bank if it offers one (matched against a header row locally, most reliable), or a PDF
            statement read by whichever AI service you've set up in Scan settings. CSV and Excel exports
            need a header row with recognizable date/description/amount columns.
          </p>
          <p className="status-error">
            Before uploading a PDF: remove or black out anything sensitive it shows beyond the
            transactions themselves — your account number, full name, and address — since it's sent to
            that AI provider to be read.
          </p>
          <p className="muted">
            {pdfConfigured
              ? `PDF statements will be read using: ${currentBankStatementStrategyLabel()}.`
              : 'No AI service configured for PDF statements — set one up in Scan settings, or use a CSV or Excel export instead.'}
          </p>
          {classifyStrategy && (
            <p className="muted">
              {classifyStrategy.label} is also set up in Scan settings, so a CSV or Excel import will use
              it too — suggesting a category for each transaction, and (unless turned off below)
              double-checking the automatic column match against a few sample rows. Either of those sends
              transaction descriptions and amounts (not full statement details) to that provider, same as
              the category suggestions already offered on a PDF import.
            </p>
          )}
          {columnCheckAvailable && (
            <label className="scan-option">
              <input type="checkbox" checked={aiColumnCheckEnabled} onChange={toggleAiColumnCheck} />
              <div>
                <strong>Double-check CSV/Excel column detection with AI</strong>
                <p className="muted">
                  The automatic column match itself needs no AI and always runs regardless — this only
                  controls the optional second opinion on top of it. Turn it off if you're out of API
                  quota right now, or would rather this file's data not go to {classifyStrategy.label} at
                  all — the plain column match alone is often enough for a well-formed export.
                </p>
              </div>
            </label>
          )}
          <button type="button" className="btn-primary" onClick={() => fileInputRef.current?.click()}>
            Choose a statement file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.csv,.xlsx,.xls,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={handleFile}
            style={{ display: 'none' }}
          />

          <details className="collapsible-section">
            <summary>No Claude or Gemini API key set up? Use an AI chat app instead</summary>
            <div className="collapsible-section-body">
              <p className="muted">
                If you'd rather use an AI chat app you already have — ChatGPT, Claude.ai, Gemini, whatever
                you pay for or have open — instead of setting up an API key here, copy the prompt below,
                paste it into that chat alongside your statement, then paste the CSV it gives you back in
                below.
              </p>
              <p className="status-error">
                Before attaching your statement there: remove or black out anything sensitive beyond the
                transactions themselves — your account number, full name, and address — since it's sent to
                whichever AI provider you use to read it, outside this app's own control.
              </p>
              <button type="button" className="btn-secondary" onClick={copyByoAiPrompt}>
                {promptCopied ? 'Copied!' : 'Copy prompt'}
              </button>
              <pre className="byo-ai-prompt">{byoAiPrompt}</pre>
              <label className="byo-ai-paste-label">
                Paste the CSV it gives you back
                <textarea
                  className="byo-ai-paste"
                  value={pastedCsv}
                  onChange={(e) => setPastedCsv(e.target.value)}
                  placeholder="Date,Description,Amount,Category&#10;2026-08-14,Coop,-42.10,Groceries&#10;..."
                  rows={6}
                />
              </label>
              <button
                type="button"
                className="btn-primary"
                onClick={handlePastedCsv}
                disabled={!pastedCsv.trim()}
              >
                Use this CSV
              </button>
            </div>
          </details>
        </>
      )}

      {step === 'parsing' && (
        <p className="page-loading">
          <span className="inline-spinner" aria-hidden="true" /> Reading your statement… this can take a
          minute or two for a long one.
        </p>
      )}

      {step === 'match-categories' && (
        <>
          <p className="muted">
            This statement already has its own category for each transaction — worth trusting over a
            guess, since the bank presumably knows what it's talking about. Its own names almost never
            match yours though (a different bank, possibly a different language), so match each one below
            to one of your categories, or leave it uncategorized. This only comes up once per bank
            category name — it's remembered for next time you import from this bank.
          </p>
          {unresolvedHints.map(({ key, label, count }) => (
            <div key={key} className="category-mapping-card">
              <span className="category-mapping-card-label">
                {label}
                <span className="muted"> — {count} transaction{count === 1 ? '' : 's'}</span>
              </span>
              <select value={categoryChoices[key] || ''} onChange={(e) => updateCategoryChoice(key, e.target.value)}>
                <option value="">Leave uncategorized</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <button type="button" className="btn-primary confirm-btn" onClick={confirmCategoryMapping}>
            Continue
          </button>
          <button type="button" className="btn-link" onClick={cancelCategoryMapping}>
            Cancel import
          </button>
        </>
      )}

      {step === 'review' && currentTx && currentEntry && (
        <>
          {parseNotices.map((notice, i) => (
            <p key={i} className="status-error">
              {notice}
            </p>
          ))}
          <p className="muted">
            Transaction {currentPosition + 1} of {totalReviewable} ({reviewedCount} reviewed)
          </p>
          <progress className="bank-tx-progress" value={reviewedCount} max={totalReviewable} />
          {categorizing && (
            <p className="muted">
              Asking AI about {categorizing.done} of {categorizing.total} descriptions…
            </p>
          )}

          <div className="bank-tx-card">
            <p className="muted">
              {new Date(currentTx.date).toLocaleDateString()} · <span className="mono">{format(currentTx.amount)}</span>
            </p>
            {duplicateIndexes.has(rawIndex) && (
              <p className="status-error">Possible duplicate — you may have already imported this one.</p>
            )}
            {crossGroupMatches.has(rawIndex) && (
              <p className="status-error">Already in {crossGroupMatches.get(rawIndex)}?</p>
            )}
            <InlineEditable
              value={descriptionForEntry(currentTx, currentEntry)}
              display={descriptionForEntry(currentTx, currentEntry)}
              onSave={(value) => updateCurrentEntry({ description: value })}
              multiline
              className="bank-tx-card-title item-editable"
              inputClassName="item-editable-input bank-tx-card-title-input"
              ariaLabel={`Edit description for ${descriptionForEntry(currentTx, currentEntry)}`}
            />
            <label className="bank-tx-card-include">
              <input
                type="checkbox"
                checked={currentEntry.include}
                onChange={(e) => updateCurrentEntry({ include: e.target.checked })}
              />
              Import this transaction
            </label>
            {currentEntry.include && (
              <select
                className="bank-tx-card-category"
                value={currentEntry.categoryId || ''}
                onChange={(e) => updateCurrentEntry({ categoryId: e.target.value })}
              >
                <option value="">Uncategorized</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-link" onClick={goBack} disabled={currentPosition === 0 || committing}>
              ← Back
            </button>
            <button type="button" className="btn-primary" onClick={goNext} disabled={committing}>
              {committing ? 'Saving…' : currentPosition + 1 < totalReviewable ? 'Next' : 'Finish'}
            </button>
          </div>
        </>
      )}

      {step === 'done' && result && (
        <>
          <p className="status-success">
            Imported {result.billCount} bill{result.billCount === 1 ? '' : 's'}.
            {result.skippedCount > 0 ? ` ${result.skippedCount} transaction${result.skippedCount === 1 ? ' was' : 's were'} left out.` : ''}
          </p>
          <Link to={`/groups/${groupId}`} className="btn-primary confirm-btn">
            Done
          </Link>
        </>
      )}
    </div>
  )
}
