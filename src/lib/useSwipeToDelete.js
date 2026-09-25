import { useCallback, useRef, useState } from 'react'

const DRAG_THRESHOLD = 8 // px of movement before a press counts as a drag, not a tap
const REVEAL_WIDTH = 76 // px the row slides — matches the delete button's own width
// On release, a row settles open if it was dragged at least halfway, or if
// it was flicked — a quick swipe that ends short of halfway still counts,
// same as native swipe lists.
const OPEN_FRACTION = 0.5
const FLICK_VELOCITY = 0.3 // px/ms
// A finger that stopped moving before lifting isn't flicking anymore.
const FLICK_MAX_AGE_MS = 100
const SETTLE_TRANSITION = 'transform 0.2s ease'

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
// While a finger is down, the row follows it by writing its transform
// straight to the DOM — no React re-render per pointermove. These lists
// live on big pages (BillView re-rendered every item row on every move
// before), and a render per move is exactly what made the drag stutter
// on a phone. React state only changes when the gesture settles (open or
// closed). Settling also writes the final position directly: React
// never saw the drag, so if the settled state renders the same style as
// before the drag (dragged a little, snapped back), React wouldn't touch
// the DOM and the row would be left wherever the finger let go.
//
// Rows that use this also need `touch-action: pan-y` in CSS: it leaves
// vertical scrolling to the browser but tells it not to claim horizontal
// drags itself — without it the browser takes the gesture over part-way
// (pointercancel) and the row stops following the finger.
export function useSwipeToDelete() {
  const [openId, setOpenId] = useState(null)
  // { id, el, startX, startY, base, offset, isDrag, lastX, lastT, velocity } | null
  const dragRef = useRef(null)
  // Set when a press turns into a drag, so the click that a mouse drag
  // ends with doesn't also open/expand the row. A touch drag produces no
  // click at all, so it's reset at the start of every new press — leaving
  // it set used to swallow the next, unrelated tap on any row in the list.
  const suppressClickRef = useRef(false)

  const close = useCallback(() => setOpenId(null), [])

  function settle(d, open) {
    d.el.style.transition = SETTLE_TRANSITION
    d.el.style.transform = `translateX(${open ? -REVEAL_WIDTH : 0}px)`
    setOpenId((prev) => (open ? d.id : prev === d.id ? null : prev))
  }

  function bind(id, onDelete) {
    const isOpen = openId === id

    function onPointerDown(e) {
      // Ignore a right-click — only the primary mouse button (or a real
      // touch/pen contact, which reports button -1) should start this.
      if (e.pointerType === 'mouse' && e.button > 0) return
      suppressClickRef.current = false
      // Only one row open at a time: touching another row closes it.
      if (openId !== null && openId !== id) setOpenId(null)
      const base = isOpen ? -REVEAL_WIDTH : 0
      dragRef.current = {
        id,
        el: e.currentTarget,
        startX: e.clientX,
        startY: e.clientY,
        base,
        offset: base,
        isDrag: false,
        lastX: e.clientX,
        lastT: e.timeStamp,
        velocity: 0,
      }
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
        suppressClickRef.current = true
        e.currentTarget.setPointerCapture?.(e.pointerId)
        d.el.style.transition = 'none'
      }
      const dt = e.timeStamp - d.lastT
      if (dt > 0) d.velocity = (e.clientX - d.lastX) / dt
      d.lastX = e.clientX
      d.lastT = e.timeStamp
      d.offset = Math.min(0, Math.max(-REVEAL_WIDTH, d.base + dx))
      d.el.style.transform = `translateX(${d.offset}px)`
    }

    function onPointerUp(e) {
      const d = dragRef.current
      if (!d || d.id !== id) return
      dragRef.current = null
      if (!d.isDrag) return
      const flicking = e.timeStamp - d.lastT <= FLICK_MAX_AGE_MS
      if (flicking && d.velocity <= -FLICK_VELOCITY) settle(d, true)
      else if (flicking && d.velocity >= FLICK_VELOCITY) settle(d, false)
      else settle(d, d.offset <= -REVEAL_WIDTH * OPEN_FRACTION)
    }

    // The browser took the gesture over (or the pointer was lost): settle
    // wherever the row got to, no flick.
    function onPointerCancel() {
      const d = dragRef.current
      if (!d || d.id !== id) return
      dragRef.current = null
      if (d.isDrag) settle(d, d.offset <= -REVEAL_WIDTH * OPEN_FRACTION)
    }

    // A tap that lands while this row is already open just closes it —
    // same as tapping an open swipe action anywhere else on iOS/Android —
    // rather than also firing whatever the row's own click normally does
    // (expanding it, say). Capture phase, so this runs and can stop the
    // row's own onClick before it ever sees the event.
    function onClickCapture(e) {
      if (suppressClickRef.current) {
        suppressClickRef.current = false
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

    return {
      row: {
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel,
        onClickCapture,
        // A bill row is a link: without this, a mouse drag starts the
        // browser's own link drag-and-drop, which cancels the swipe.
        draggable: false,
        style: {
          transform: `translateX(${isOpen ? -REVEAL_WIDTH : 0}px)`,
          transition: SETTLE_TRANSITION,
        },
      },
      deleteButton: { onClick: onDeleteClick },
      isOpen,
    }
  }

  return { bind, close }
}
