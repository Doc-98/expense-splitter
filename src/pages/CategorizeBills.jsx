import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { fetchAllRows } from '../lib/fetchAllRows'
import { fetchCategories } from '../lib/categories'
import { loadErrorMessage } from '../lib/loadErrorMessage'
import { billTotal } from '../lib/billFilters'
import { useCurrency } from '../context/CurrencyContext'
import { buildTitleGroups, applyAiSuggestions } from '../lib/billCategorization/plan'
import { classifyTitles, resolveClassifyStrategy } from '../lib/billCategorization'
import { findKeywordClusters } from '../lib/billCategorization/keywordClusters'

// Supabase/Postgres queries have a practical limit on how many IDs belong
// in one `.in(...)` — a single category can end up covering bills from
// many different merchants pooled together (unlike a title group, which
// realistically never gets anywhere near this size), so the actual write
// step chunks by this regardless of how many distinct titles fed into it.
const UPDATE_CHUNK_SIZE = 200

function chunk(array, size) {
  const chunks = []
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size))
  return chunks
}

// Confidence tiers, most trustworthy first — Splitwise's own category was
// a person's real judgment at the time, the AI's is a guess from a bare
// title alone, and "none" is exactly the bills this whole wizard can't
// save you from looking at by hand. Purely a *display* order (which
// section a group's row renders under); nothing here affects what gets
// written.
const TIER_LABELS = {
  splitwise: "From Splitwise's own category",
  ai: 'AI suggested',
  none: 'Needs your input',
}

export default function CategorizeBills() {
  const { groupId } = useParams()
  const { format } = useCurrency()

  // 'loading' -> 'landing' -> 'running' -> 'review' -> 'done'
  const [step, setStep] = useState('loading')
  const [error, setError] = useState(null)
  const [categories, setCategories] = useState([])
  const [bills, setBills] = useState([])
  const [progress, setProgress] = useState(null) // { done, total } | null, only while AI is running
  const [groups, setGroups] = useState([])
  // groupKey -> category id, or '' for "leave uncategorized" — seeded
  // from each group's own suggestion once runCategorization() finishes,
  // then freely editable per row before anything is actually saved.
  const [selections, setSelections] = useState({})
  const [applying, setApplying] = useState(false)
  const [appliedCount, setAppliedCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [categoriesData, billsData] = await Promise.all([
          fetchCategories(groupId),
          fetchAllRows(() =>
            supabase
              .from('bills')
              .select('id, title, note, items(total_price)', { count: 'exact' })
              .eq('group_id', groupId)
              .is('category_id', null)
          ),
        ])
        if (cancelled) return
        setCategories(categoriesData)
        // Each bill's total is only needed as human-facing context on the
        // review screen (see the doc comment on buildTitleGroups() in
        // plan.js for why it's deliberately never sent to the AI) —
        // computed once here with the same billTotal() helper every other
        // page uses, rather than carrying the raw `items` rows around.
        setBills(billsData.map((bill) => ({ ...bill, total: billTotal(bill) })))
        setStep('landing')
      } catch (err) {
        if (cancelled) return
        setError(loadErrorMessage(err))
        setStep('landing')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [groupId])

  const classifyStrategy = resolveClassifyStrategy()

  async function runCategorization() {
    setStep('running')
    setError(null)
    setProgress(null)
    try {
      let nextGroups = buildTitleGroups(bills, categories)
      const unresolvedTitles = nextGroups.filter((g) => g.source === 'none').map((g) => g.title)

      if (unresolvedTitles.length > 0 && classifyStrategy) {
        const categoryNames = categories.map((c) => c.name)
        const aiResults = await classifyTitles(unresolvedTitles, categoryNames, (done, total) =>
          setProgress({ done, total })
        )
        nextGroups = applyAiSuggestions(nextGroups, aiResults, categories)
      }

      const tierOrder = { splitwise: 0, ai: 1, none: 2 }
      nextGroups.sort((a, b) => tierOrder[a.source] - tierOrder[b.source] || b.billIds.length - a.billIds.length)

      setGroups(nextGroups)
      setSelections(Object.fromEntries(nextGroups.map((g) => [g.key, g.suggestedCategoryId || ''])))
      setStep('review')
    } catch (err) {
      setError(err.message)
      setStep('landing')
    } finally {
      setProgress(null)
    }
  }

  function updateSelection(key, categoryId) {
    setSelections((s) => ({ ...s, [key]: categoryId }))
  }

  // Recomputed whenever the groups change, not on every render — findKeywordClusters()
  // walks every group's title each time it runs, and groups themselves only change once
  // (when runCategorization() finishes).
  const keywordClusters = useMemo(() => findKeywordClusters(groups), [groups])
  // keyword -> category id chosen in that cluster's own picker, kept separate from
  // `selections` so picking a bulk category doesn't itself change anything until
  // "Apply" is clicked — the per-row selects below stay the single source of truth
  // for what's actually going to be saved.
  const [clusterPicks, setClusterPicks] = useState({})

  function applyToKeywordCluster(cluster) {
    const categoryId = clusterPicks[cluster.keyword]
    if (!categoryId) return
    setSelections((s) => {
      const next = { ...s }
      for (const key of cluster.groupKeys) next[key] = categoryId
      return next
    })
  }

  const resolvedBillCount = groups.reduce((sum, g) => (selections[g.key] ? sum + g.billIds.length : sum), 0)

  async function applyCategorization() {
    setApplying(true)
    setError(null)
    try {
      const billIdsByCategory = new Map()
      for (const group of groups) {
        const categoryId = selections[group.key]
        if (!categoryId) continue
        if (!billIdsByCategory.has(categoryId)) billIdsByCategory.set(categoryId, [])
        billIdsByCategory.get(categoryId).push(...group.billIds)
      }

      const requests = []
      for (const [categoryId, billIds] of billIdsByCategory) {
        for (const idsChunk of chunk(billIds, UPDATE_CHUNK_SIZE)) {
          requests.push(supabase.from('bills').update({ category_id: categoryId }).in('id', idsChunk))
        }
      }

      const results = await Promise.all(requests)
      const firstError = results.find((r) => r.error)?.error
      if (firstError) throw firstError

      setAppliedCount(resolvedBillCount)
      setStep('done')
    } catch (err) {
      setError(err.message)
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <Link to={`/groups/${groupId}/settings`} className="btn-link">
          ← Back
        </Link>
        <h1>Categorize bills</h1>
      </header>

      {error && <p className="status-error">{error}</p>}

      {step === 'loading' && <p className="page-loading">Loading…</p>}

      {step === 'landing' && (
        <>
          <p className="muted">
            For bills — usually from a Splitwise import — that never got a category. Two passes: first,
            free and instant, matching whatever category Splitwise itself had for a bill (kept in its
            note when it was imported) against your own category names; then, for whatever's left, the
            same AI setup you use for scanning receipts guesses from the bill's title alone. Nothing is
            saved until you've reviewed and confirmed every suggestion on the next screen.
          </p>

          {categories.length === 0 ? (
            <p className="empty-state">
              This group has no categories yet — add some in{' '}
              <Link to={`/groups/${groupId}/settings`}>Group settings</Link> first, then come back.
            </p>
          ) : bills.length === 0 ? (
            <p className="empty-state">Every bill in this group already has a category — nothing to do here.</p>
          ) : (
            <>
              <p>
                <strong>{bills.length}</strong> bill{bills.length === 1 ? '' : 's'} with no category.
              </p>
              {!classifyStrategy && (
                <p className="muted">
                  No AI service configured, so only the free Splitwise-matching pass will run — the rest
                  will be listed as needing your own input rather than guessed at. Set one up in{' '}
                  <Link to="/scan-settings">Scan settings</Link> (the exact same setup used for scanning
                  receipts) for AI help with the rest too.
                </p>
              )}
              <button type="button" className="btn-primary confirm-btn" onClick={runCategorization}>
                Categorize bills
              </button>
            </>
          )}
        </>
      )}

      {step === 'running' && (
        <p className="page-loading">
          {progress ? `Asking AI about ${progress.done} of ${progress.total} titles…` : 'Matching against your categories…'}
        </p>
      )}

      {step === 'review' && (
        <>
          <p>
            <strong>{resolvedBillCount}</strong> of <strong>{bills.length}</strong> bills will be
            categorized. Change any suggestion below, or set it to "Leave uncategorized" to skip it —
            nothing is saved until you confirm.
          </p>

          {keywordClusters.length > 0 && (
            <div>
              <h2 className="settings-section-title">Common patterns</h2>
              <p className="muted">
                These words show up across several differently-titled bills — likely the same merchant
                typed a bit differently each time (a date, a location, a note). Pick a category and apply
                it to every one of them at once; you can still change any individual row afterward.
              </p>
              <ul className="member-list">
                {keywordClusters.map((cluster) => (
                  <li key={cluster.keyword} className="member-list-item">
                    <span className="categorize-row-title">
                      "{cluster.keyword}"
                      <span className="muted">
                        {' '}
                        ({cluster.groupKeys.length} titles, {cluster.billCount} bill
                        {cluster.billCount === 1 ? '' : 's'})
                      </span>
                    </span>
                    <span className="member-list-actions">
                      <select
                        className="categorize-row-select"
                        value={clusterPicks[cluster.keyword] || ''}
                        onChange={(e) =>
                          setClusterPicks((p) => ({ ...p, [cluster.keyword]: e.target.value }))
                        }
                      >
                        <option value="">Choose category…</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn-link"
                        disabled={!clusterPicks[cluster.keyword]}
                        onClick={() => applyToKeywordCluster(cluster)}
                      >
                        Apply to all
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {['splitwise', 'ai', 'none'].map((tier) => {
            const tierGroups = groups.filter((g) => g.source === tier)
            if (tierGroups.length === 0) return null
            return (
              <div key={tier}>
                <h2 className="settings-section-title">{TIER_LABELS[tier]}</h2>
                <ul className="member-list">
                  {tierGroups.map((group) => (
                    <li key={group.key} className="member-list-item">
                      <span className="categorize-row-title">
                        {group.title}
                        <span className="muted">
                          {' '}
                          ({group.billIds.length} bill{group.billIds.length === 1 ? '' : 's'}, total{' '}
                          {format(group.totalAmount)})
                        </span>
                      </span>
                      <select
                        className="categorize-row-select"
                        value={selections[group.key] || ''}
                        onChange={(e) => updateSelection(group.key, e.target.value)}
                      >
                        <option value="">Leave uncategorized</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}

          <button
            type="button"
            className="btn-primary confirm-btn"
            disabled={resolvedBillCount === 0 || applying}
            onClick={applyCategorization}
          >
            {applying ? 'Applying…' : `Apply to ${resolvedBillCount} bill${resolvedBillCount === 1 ? '' : 's'}`}
          </button>
        </>
      )}

      {step === 'done' && (
        <>
          <p className="status-success">
            Categorized {appliedCount} bill{appliedCount === 1 ? '' : 's'}.
          </p>
          <Link to={`/groups/${groupId}/settings`} className="btn-primary confirm-btn">
            Done
          </Link>
        </>
      )}
    </div>
  )
}
