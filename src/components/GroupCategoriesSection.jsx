import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchCategories, addCategory, renameCategory, deleteCategory, updateCategoryColor, CATEGORY_COLORS } from '../lib/categories'
import { loadErrorMessage } from '../lib/loadErrorMessage'
import { groupCategoriesCache } from '../lib/groupCategoriesCache'
import { useClickOutside } from '../lib/useClickOutside'
import ColorSwatchPicker from './ColorSwatchPicker'
import CategoryColorButton from './CategoryColorButton'
import { ArrowRightIcon } from './icons'

// The "⋮" per-row menu — same shape as GroupSubscriptionsSection.jsx's own
// TemplateMenu (Rename/Delete instead of Edit/Pause/Delete). Kept local to
// this file rather than its own component, same reasoning as that one:
// only ever used here.
function CategoryMenu({ category, onRename, onDelete }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  useClickOutside(wrapRef, () => setOpen(false), open)

  function run(action) {
    setOpen(false)
    action()
  }

  return (
    <div className="row-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className="row-menu-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Actions for ${category.name}`}
      >
        ⋮
      </button>
      {open && (
        <div className="row-menu-popover">
          <button type="button" className="dropdown-item" onClick={() => run(onRename)}>
            Rename
          </button>
          <button type="button" className="dropdown-item dropdown-item-warn" onClick={() => run(onDelete)}>
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

export default function GroupCategoriesSection() {
  const { groupId } = useParams()

  // Seeded straight from groupCategoriesCache when there's anything there
  // — either a prefetch fired the instant the group page's own Settings
  // (gear) icon was clicked (see prefetchGroupSettings.js/GroupView.jsx)
  // or a previous visit this session.
  const [categories, setCategories] = useState(() => groupCategoriesCache.get(groupId) ?? [])
  const [error, setError] = useState(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState(CATEGORY_COLORS[0])
  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')

  const loadCategories = useCallback(async () => {
    try {
      const data = await fetchCategories(groupId)
      setCategories(data)
      groupCategoriesCache.set(groupId, data)
    } catch (err) {
      // Keeps whatever's on screen (the cached list, if any) rather than
      // looking like the group has no categories.
      setError(`Couldn't load categories: ${loadErrorMessage(err)}`)
    }
  }, [groupId])

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  async function submitAddCategory(e) {
    e.preventDefault()
    if (!newCategoryName.trim()) return
    setError(null)
    try {
      await addCategory(groupId, newCategoryName.trim(), newCategoryColor)
      setNewCategoryName('')
      loadCategories()
    } catch (err) {
      setError(err.message)
    }
  }

  async function saveCategoryRename(categoryId) {
    if (!editingCategoryName.trim()) return
    setError(null)
    try {
      await renameCategory(categoryId, editingCategoryName.trim())
      setEditingCategoryId(null)
      loadCategories()
    } catch (err) {
      setError(err.message)
    }
  }

  // Applied straight away, no confirm step — same as picking a color when
  // first adding a category, and easy enough to undo (click the dot again)
  // that a confirmation would only be friction.
  async function handleCategoryColorChange(categoryId, color) {
    setError(null)
    const previous = categories
    const optimistic = categories.map((c) => (c.id === categoryId ? { ...c, color } : c))
    setCategories(optimistic)
    groupCategoriesCache.set(groupId, optimistic)
    try {
      await updateCategoryColor(categoryId, color)
    } catch (err) {
      setCategories(previous)
      groupCategoriesCache.set(groupId, previous)
      setError(err.message)
    }
  }

  async function handleDeleteCategory(category) {
    if (
      !window.confirm(
        `Delete "${category.name}"? Any bills or items tagged with it will become uncategorized — nothing about them is deleted.`
      )
    ) {
      return
    }
    setError(null)
    try {
      await deleteCategory(category.id)
      loadCategories()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <>
      <h2 className="settings-section-title">Categories</h2>
      <p className="muted">
        Tag a bill (or an individual item, if it belongs somewhere else) with one of these to see
        how you spend, not just how much, on the group's stats page.
      </p>
      <ul className="member-list">
        {categories.map((cat) => (
          <li key={cat.id} className="member-list-item">
            {editingCategoryId === cat.id ? (
              <form
                className="guest-rename-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  saveCategoryRename(cat.id)
                }}
              >
                <CategoryColorButton color={cat.color} onChangeColor={(color) => handleCategoryColorChange(cat.id, color)} />
                <input value={editingCategoryName} onChange={(e) => setEditingCategoryName(e.target.value)} autoFocus />
                <button type="submit" className="btn-link">
                  Save
                </button>
                <button type="button" className="btn-link" onClick={() => setEditingCategoryId(null)}>
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <span className="category-label">
                  <CategoryColorButton color={cat.color} onChangeColor={(color) => handleCategoryColorChange(cat.id, color)} />
                  {cat.name}
                </span>
                <CategoryMenu
                  category={cat}
                  onRename={() => {
                    setEditingCategoryId(cat.id)
                    setEditingCategoryName(cat.name)
                  }}
                  onDelete={() => handleDeleteCategory(cat)}
                />
              </>
            )}
          </li>
        ))}
      </ul>
      <h2 className="settings-section-title">New category</h2>
      {/* Same input-with-submit pattern as Create group/Add bill/Group
          name — the color picker is a second, non-blocking field (it
          always already holds a value, defaulting to the first preset),
          so unlike "Add subscription" this still has exactly one field
          that gates submission, and stays a single arrow-in-the-field
          rather than a separate labeled pill. */}
      <form onSubmit={submitAddCategory} className="stacked-form">
        <div className="input-with-submit">
          <input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="New category" />
          <button
            type="submit"
            className="input-submit-btn"
            disabled={!newCategoryName.trim()}
            aria-label="Add category"
          >
            <ArrowRightIcon size={16} />
          </button>
        </div>
        <ColorSwatchPicker value={newCategoryColor} onChange={setNewCategoryColor} />
      </form>

      {error && <p className="status-error">{error}</p>}
    </>
  )
}
