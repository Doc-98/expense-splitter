import { useCallback, useRef, useState } from 'react'

const DRAG_THRESHOLD = 8 // px of movement before a press counts as a drag, not a tap
const OPEN_AT = 56 // px of left-swipe that snaps the reveal open on release
const REVEAL_WIDTH = 76 // px the row slides — matches the delete button's own width

// A reusable "swipe left to reveal a delete button" gesture — built once
// here so any list row across the app (item rows first, more later) can
// adopt the same interaction instead of each screen inventing its own.
// Deliberately reveal-then-tap, not delete-on-swipe: the swipe alone is
// never destructive by itself (same as iOS Mail/Reminders), which is also
// why this doesn't try to *be* a row's only way to delete something —
// per NN/g's own guidance on contextual swipe
// (https://www.nngroup.com/articles/contextual-swipe/), a gesture should
// never be the sole way to reach an action, so callers using this still
// want a plain, visible delete control somewhere too.
//
// Call this once per list (not per row, same reasoning as useLongPress),
// and use the `bind(id, onDelete)` it returns to wire up each row — `id`
// is whatever uniquely identifies that row (an item id, a member id, …).
// Only one row is ever open at a time; opening a new one closes whichever
// was open, same as most native swipe-list implementations.
//
// The in-progress drag itself lives in a ref, not useState: a real drag
// fires pointermove many times before React ever gets a chance to
// re-render, so a functional setState updater would be reading stale
// values across calls in the same gesture — and this also needs to call
// a real side effect (setPointerCapture) exactly once per gesture, which
// an updater callback isn't safe to do (React may invoke one more than
// once). The ref stays the single source of truth for "what's the gesture
// doing right now"; a small render-counter state forces the one re-render
// per move needed to actually update the row's visual offset.
export function useSwipeToDelete() {
  const [openId, setOpenId] = useState(null)
  const dragRef = useRef(null) // { id, startX, startY, base, offset, isDrag } | null
  const wasDragRef = useRef(false) // consumed by the very next click, see onClickCapture below
  const [, bump] = useState(0)
  const rerender = useCallback(() => bump((n) => n + 1), [])

  const close = useCallback(() => setOpenId(null), [])

  function bind(id, onDelete) {
    const isOpen = openId === id
    const dragging = dragRef.current
    const draggingThis = dragging && dragging.id === id

    function onPointerDown(e) {
      // Ignore a right-click — only the primary mouse button (or a real
      // touch/pen contact, which reports button -1) should start this.
      if (e.pointerType === 'mouse' && e.button > 0) return
      const base = isOpen ? -REVEAL_WIDTH : 0
      dragRef.current = { id, startX: e.clientX, startY: e.clientY, base, offset: base, isDrag: false }
    }

    function onPointerMove(e) {
      const d = dragRef.current
      if (!d || d.id !== id) return
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      if (!d.isDrag) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
        // A finger moving mostly vertically is scrolling the page, not
        // swiping this row — abandon the gesture rather than fight it.
        if (Math.abs(dy) > Math.abs(dx)) {
          dragRef.current = null
          return
        }
        d.isDrag = true
        wasDragRef.current = true
        e.currentTarget.setPointerCapture?.(e.pointerId)
      }
      d.offset = Math.min(0, Math.max(-REVEAL_WIDTH, d.base + dx))
      rerender()
    }

    function onPointerEnd() {
      const d = dragRef.current
      if (!d || d.id !== id) return
      dragRef.current = null
      if (d.isDrag) setOpenId(d.offset <= -OPEN_AT ? id : null)
      else rerender()
    }

    // A tap that lands while this row is already open just closes it —
    // same as tapping an open swipe action anywhere else on iOS/Android —
    // rather than also firing whatever the row's own click normally does
    // (expanding it, say). Capture phase, so this runs and can stop the
    // row's own onClick before it ever sees the event. wasDragRef (not
    // the `draggingThis` snapshot above) is what actually decides the
    // first branch — pointerup already clears dragRef synchronously
    // before click fires, so by the time this runs draggingThis would
    // always read false even for a click that just finished a real drag.
    function onClickCapture(e) {
      if (wasDragRef.current) {
        wasDragRef.current = false
        e.preventDefault()
        e.stopPropagation()
      } else if (isOpen) {
        e.preventDefault()
        e.stopPropagation()
        setOpenId(null)
      }
    }

    function onDeleteClick(e) {
      e.stopPropagation()
      setOpenId(null)
      onDelete()
    }

    const offset = draggingThis ? dragging.offset : isOpen ? -REVEAL_WIDTH : 0
    return {
      row: {
        onPointerDown,
        onPointerMove,
        onPointerUp: onPointerEnd,
        onPointerCancel: onPointerEnd,
        onClickCapture,
        style: {
          transform: `translateX(${offset}px)`,
          transition: draggingThis && dragging.isDrag ? 'none' : 'transform 0.2s ease',
        },
      },
      deleteButton: { onClick: onDeleteClick },
      isOpen,
    }
  }

  return { bind, close }
}
