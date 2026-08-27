import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { DEFAULT_CATEGORIES, mergeCategoriesByName } from '../lib/categories'
import { fetchThresholds, saveThreshold, deleteThreshold } from '../lib/thresholds'
import { parseNumber } from '../lib/parseNumber'

const DEFAULT_NAME_KEYS = new Set(DEFAULT_CATEGORIES.map((c) => c.name.toLowerCase()))

export default function Thresholds() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [customCategories, setCustomCategories] = useState([]) // merged, non-default tags across my groups
  const [thresholdByKey, setThresholdByKey] = useState(new Map()) // lowercased name -> { category_name, amount }
  const [drafts, setDrafts] = useState({}) // lowercased name -> in-progress input string
  const [savedKey, setSavedKey] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const { data: memberRows, error: memberError } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', user.id)
        .eq('active', true)
      if (memberError) throw memberError
      const groupIds = [...new Set((memberRows || []).map((r) => r.group_id))]

      const { data: categoriesData, error: categoriesError } = groupIds.length
        ? await supabase
            .from('categories')
            .select('name, color')
            .in('group_id', groupIds)
            .order('created_at', { ascending: true })
        : { data: [], error: null }
      if (categoriesError) throw categoriesError

      const merged = mergeCategoriesByName(categoriesData || [])
      const custom = merged
        .filter((c) => !DEFAULT_NAME_KEYS.has(c.name.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name))
      setCustomCategories(custom)

      const thresholds = await fetchThresholds(user.id)
      setThresholdByKey(new Map(thresholds.map((t) => [t.category_name.trim().toLowerCase(), t])))
    } catch (err) {
      // Without this, a failure anywhere above (most likely: the
      // spending_thresholds table not existing yet on a database that
      // hasn't run supabase/migrations/thresholds.sql) left this page spinning on
      // "Loading…" forever with the actual error invisible — setLoading(false)
      // was only ever reached on the success path.
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
        setThresholdByKey((m) => new Map(m).set(key, { category_name: name, amount }))
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
    <div className="page">
      <header className="page-header">
        <button type="button" className="btn-link" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <h1>Spending thresholds</h1>
      </header>

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
    </div>
  )
}
