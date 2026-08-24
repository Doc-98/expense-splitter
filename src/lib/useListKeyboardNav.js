import { useEffect, useRef, useState } from 'react'
import { isTypingTarget } from './isTypingTarget'

// Shared ↑/↓/Enter/←/→ keyboard navigation for a paginated list of
// row-links — GroupView.jsx's bill list and Groups.jsx's group list both
// use this, and share its behavior exactly rather than two independently
// drifting copies of the same ~40 lines. See README's "Keyboard
// navigation" section for the user-facing behavior this implements.
//
// Owns just the state a caller needs to render the highlight and wire up
// "open a row" — rendering the rows themselves, and the Pagination
// component, stay with the caller. `itemCount` is the *current page's*
// own count (↑/↓ move within it); `maxPage`/`setPage` are what ←/→ hand
// off to, same page state the mouse-driven Pagination buttons already
// use. `onOpen(index)` is called on Enter with the highlighted row's
// index into the current page. `disabled` turns the whole thing off
// without resetting it — GroupView.jsx passes its own selectMode here,
// since arrow keys/Enter already mean something else (moving through
// checkboxes) while that's on; the caller is still expected to mask the
// visual highlight itself (`active && !selectMode && ...`), same as
// `disabled` only pauses new keyboard actions, not whatever was already
// selected.
export function useListKeyboardNav({ page, setPage, maxPage, itemCount, onOpen, disabled = false }) {
  const [focusedIndex, setFocusedIndex] = useState(0)
  // Only true once ↑/↓/← /→ have actually been used — a row isn't shown
  // highlighted for a mouse-only visit that never touched the keyboard.
  // Dropped again on a plain Tab (about to focus something else entirely)
  // or on mouse movement over the list (see onListMouseMove below), same
  // "goes away until you touch the keyboard again" convention as Gmail's
  // j/k.
  const [active, setActive] = useState(false)
  const rowRef = useRef(null)

  // The highlighted row resets to the top on every page flip (arrows or
  // Pagination's own buttons alike — both just set `page`), and is
  // clamped if the page's own item count shrinks out from under it (a
  // filter narrowing the results while staying on the same page).
  useEffect(() => {
    setFocusedIndex(0)
  }, [page])
  useEffect(() => {
    setFocusedIndex((i) => Math.min(i, Math.max(0, itemCount - 1)))
  }, [itemCount])

  // Brings the highlighted row into view as ↑/↓ moves it past the edge of
  // the screen — the same "shouldn't have to go hunting for it" fix as
  // the sticky pagination bar (see .pagination in styles.css), just for
  // the row itself instead of the page controls.
  useEffect(() => {
    if (active) rowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [focusedIndex, page, active])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Tab') {
        setActive(false)
        return
      }
      if (disabled || isTypingTarget(document.activeElement) || itemCount === 0) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setActive(true)
        setPage((p) => Math.max(0, p - 1))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setActive(true)
        setPage((p) => Math.min(maxPage, p + 1))
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        // The first ↑/↓ of a visit just reveals the highlight at whatever
        // it's already sitting on (the top of the page, index 0) rather
        // than immediately jumping past it to index 1 — otherwise the
        // very first row on a page could never actually be seen
        // highlighted.
        if (!active) setActive(true)
        else setFocusedIndex((i) => Math.min(itemCount - 1, i + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (!active) setActive(true)
        else setFocusedIndex((i) => Math.max(0, i - 1))
      } else if (e.key === 'Enter' && active) {
        e.preventDefault()
        onOpen(focusedIndex)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [disabled, itemCount, maxPage, setPage, active, focusedIndex, onOpen])

  function onListMouseMove() {
    if (active) setActive(false)
  }

  return { focusedIndex, active, rowRef, onListMouseMove }
}
