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
// value looks like beyond one universal rule it enforces itself:
// confirming an empty (or whitespace-only) box always reverts rather than
// saving, never handed to onSave at all. That's not left to each caller's
// own validation because it's too easy to get wrong for a numeric field —
// parseNumber('') is 0, a perfectly "valid" number, not NaN, so a
// per-field NaN check alone would happily save a cleared price as zero
// instead of reverting it. Beyond that one rule, a caller that does
// nothing on invalid input effectively reverts too, since the display
// then just falls back to showing the unchanged `value` prop.
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
    if (draft.trim() === '') return // confirming empty always reverts, never saves
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
