import { useEffect, useRef, useState } from 'react'

// A piece of text that turns into a text input on click/tap — no button,
// no separate Save/Cancel. Enter or clicking/tapping away (blur) commits;
// Escape reverts without saving at all. `value` is the raw editable value
// (e.g. "1.29", not "$1.29") — `display` is what's shown before editing,
// so a caller can show a formatted/prefixed version (currency symbol, "x "
// prefix, etc.) while editing works with the plain number underneath.
//
// Generic on purpose: ItemRow uses this four times per row (name, unit
// price, quantity, total price), each with its own validation living in
// its own onSave — this component doesn't know or care what a "valid"
// value looks like, it just hands whatever was typed to onSave and lets
// the caller decide whether to act on it. A caller that does nothing on
// invalid input effectively reverts, since the display then just falls
// back to showing the unchanged `value` prop.
export default function InlineEditable({ value, display, onSave, inputMode, className, inputClassName, ariaLabel }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  function startEdit() {
    setDraft(value)
    setEditing(true)
  }

  function commit() {
    if (!editing) return // avoids a double-commit when Enter's blur() also fires onBlur
    setEditing(false)
    if (draft !== value) onSave(draft)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setDraft(value)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        className={inputClassName}
        inputMode={inputMode}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        aria-label={ariaLabel}
      />
    )
  }

  return (
    <button type="button" className={className} onClick={startEdit} aria-label={ariaLabel}>
      {display}
    </button>
  )
}
