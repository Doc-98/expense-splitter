import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { DEFAULT_CATEGORIES } from '../lib/categories'
import { saveThreshold, deleteThreshold } from '../lib/thresholds'
import { parseNumber } from '../lib/parseNumber'
import { fetchBudgetsData } from '../lib/prefetchSettings'
import { budgetsCache, BUDGETS_CACHE_KEY } from '../lib/budgetsCache'

// The actual "budgets" (formerly "spending thresholds" — renamed in the UI,
// see the Settings restructure) UI/logic. Used to also be reachable
// standalone at /budgets (a thin Budgets.jsx page wrapper, for a deep link
// from Your Stats' own "Manage budgets →") — both are gone now that
// Settings → Budgets is the only way in, and this is the only place the
// UI/logic itself lives.
// Kept internally as "threshold" throughout (state, the spending_thresholds
// table, lib/thresholds.js) — only the user-facing copy changed, to avoid a
// database migration and a much wider rename for no visible benefit.
export default function BudgetsSection() {
  const { user } = useAuth()

  // Seeded straight from budgetsCache when there's anything there — either
  // a prefetch fired the instant the account chip was clicked (see
  // prefetchSettings.js/AppHeader.jsx) or a previous visit this session —
  // same "paint from cache, then quietly revalidate" trick
  // groupsListCache.js already gets Groups.jsx. `loading` starts false in
  // that case since there's already real data to show.
  const cached = budgetsCache.get(BUDGETS_CACHE_KEY)
  const [loading, setLoading] = useState(!cached)
  const [customCategories, setCustomCategories] = useState(cached?.customCategories ?? []) // merged, non-default tags across my groups
  const [thresholdByKey, setThresholdByKey] = useState(cached?.thresholdByKey ?? new Map()) // lowercased name -> { category_name, amount }
  const [drafts, setDrafts] = useState({}) // lowercased name -> in-progress input string
  const [savedKey, setSavedKey] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const data = await fetchBudgetsData(user.id)
      setCustomCategories(data.customCategories)
      setThresholdByKey(data.thresholdByKey)
      budgetsCache.set(BUDGETS_CACHE_KEY, data)
    } catch (err) {
      // Without this, a failure anywhere above (most likely: the
      // spending_thresholds table not existing yet on a database that
      // hasn't run supabase/migrations/20260820224234_thresholds.sql) left this page
      // spinning on "Loading…" forever with the actual error invisible —
      // setLoading(false) was only ever reached on the success path.
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [user.id])

  useEffect(() => {
    load()
  }, [load])

  function draftValue(name) {
    const key = name.toLowerCase()
    if (key in drafts) return drafts[key]
    return thresholdByKey.get(key)?.amount ?? ''
  }

  function updateDraft(name, value) {
    setDrafts((d) => ({ ...d, [name.toLowerCase()]: value }))
  }

  async function saveRow(name) {
    const key = name.toLowerCase()
    if (!(key in drafts)) return // untouched — nothing to save
    const raw = drafts[key]
    setError(null)

    try {
      if (raw.trim() === '') {
        const existing = thresholdByKey.get(key)
        if (existing) {
          await deleteThreshold(user.id, existing.category_name)
          setThresholdByKey((m) => {
            const next = new Map(m)
            next.delete(key)
            budgetsCache.set(BUDGETS_CACHE_KEY, { customCategories, thresholdByKey: next })
            return next
          })
        }
      } else {
        const amount = Math.round(parseNumber(raw) * 100) / 100
        if (!Number.isFinite(amount) || amount <= 0) {
          setError(`"${raw}" isn't a valid budget amount.`)
          return
        }
        await saveThreshold(user.id, name, amount)
        setThresholdByKey((m) => {
          const next = new Map(m).set(key, { category_name: name, amount })
          budgetsCache.set(BUDGETS_CACHE_KEY, { customCategories, thresholdByKey: next })
          return next
        })
      }
      setDrafts((d) => {
        const next = { ...d }
        delete next[key]
        return next
      })
      setSavedKey(key)
      setTimeout(() => setSavedKey(null), 1200)
    } catch (err) {
      setError(err.message)
    }
  }

  function renderRow(cat) {
    const key = cat.name.toLowerCase()
    return (
      <li key={key} className="member-list-item threshold-row">
        <span className="category-label">
          <span className="category-dot" style={{ background: cat.color }} />
          {cat.name}
        </span>
        <span className="threshold-input-wrap">
          <input
            value={draftValue(cat.name)}
            onChange={(e) => updateDraft(cat.name, e.target.value)}
            onBlur={() => saveRow(cat.name)}
            placeholder="No budget"
            inputMode="decimal"
          />
          {savedKey === key && <span className="muted note-saved">Saved</span>}
        </span>
      </li>
    )
  }

  return (
    <>
      <p className="muted">
        A personal monthly budget per category — always compared against this calendar month, and
        only your own share of what's been spent (not what you've fronted for others). Shown on
        Your Stats once set. Leave a category blank to stop tracking it.
      </p>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <h2 className="settings-section-title">Default categories</h2>
          <ul className="member-list">{DEFAULT_CATEGORIES.map(renderRow)}</ul>

          {customCategories.length > 0 && (
            <>
              <h2 className="settings-section-title">Your groups' custom categories</h2>
              <p className="muted">
                Combines every custom category across the groups you're in — a tag with the same
                name in two different groups (or one shared with a default category's name) is
                treated as one and the same budget here.
              </p>
              <ul className="member-list">{customCategories.map(renderRow)}</ul>
            </>
          )}

          {error && <p className="status-error">{error}</p>}
        </>
      )}
    </>
  )
}
