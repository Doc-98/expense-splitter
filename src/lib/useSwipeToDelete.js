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
//
// Two more things keep the tap after a swipe from being lost on a phone.
// touch-action alone still lets Chrome treat the swipe as a scroll gesture
// of its own, just one it doesn't act on; lifting the finger then leaves an
// invisible fling "running", and the next tap anywhere only stops that
// fling — no click at all. So once a press is a horizontal swipe, its
// touchmoves are cancelled (a non-passive listener: React's own touch
// handlers are passive and can't), and the browser never starts a gesture
// of its own. And the Remove button acts on the finger lifting off it
// rather than on `click`, so even a click the browser drops still deletes.
// The click that normally follows is swallowed wherever it lands: by then
// the row is gone and the next one has slid under the finger, and a click
// on it would open that bill or expand that item. Keyboard and screen
// reader activation (a click with no pointer before it) still works.
const CLICK_AFTER_REMOVE_MS = 600

// Swallows the one click a pointer Remove is followed by, if it comes.
function swallowNextClick() {
  const until = performance.now() + CLICK_AFTER_REMOVE_MS
  function onClick(e) {
    window.removeEventListener('click', onClick, true)
    if (performance.now() > until) return
    e.preventDefault()
    e.stopPropagation()
  }
  window.addEventListener('click', onClick, true)
  setTimeout(() => window.removeEventListener('click', onClick, true), CLICK_AFTER_REMOVE_MS)
}

export function useSwipeToDelete() {
  const [openId, setOpenId] = useState(null)
  // { id, el, onTouchMove, startX, startY, base, offset, isDrag, lastX, lastT, velocity } | null
  const dragRef = useRef(null)
  // Set when a press turns into a drag, so the click that a mouse drag
  // ends with doesn't also open/expand the row. A touch drag produces no
  // click at all, so it's reset at the start of every new press — leaving
  // it set used to swallow the next, unrelated tap on any row in the list.
  const suppressClickRef = useRef(false)
  // The press on a Remove button in progress: { id, pointerId, x, y } | null.
  const deletePressRef = useRef(null)

  const close = useCallback(() => setOpenId(null), [])

  // Cancels the touchmoves of a press once it has become a horizontal
  // swipe (see the note above useSwipeToDelete). Before that, and for a
  // press that turns out to be a vertical scroll, touchmoves are left
  // alone so the page scrolls as usual.
  function onTouchMove(e) {
    if (dragRef.current?.isDrag && e.cancelable) e.preventDefault()
  }

  function endDrag(d) {
    if (d.onTouchMove) d.el.removeEventListener('touchmove', d.onTouchMove)
    dragRef.current = null
  }

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
      if (dragRef.current) endDrag(dragRef.current)
      // Kept on the drag itself, so the exact function added is the one
      // removed even if the list re-renders mid-swipe.
      const touchMoveListener = e.pointerType === 'touch' ? onTouchMove : null
      if (touchMoveListener) e.currentTarget.addEventListener('touchmove', touchMoveListener, { passive: false })
      dragRef.current = {
        onTouchMove: touchMoveListener,
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
          endDrag(d)
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
      endDrag(d)
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
      endDrag(d)
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

    function remove() {
      setOpenId(null)
      onDelete()
    }

    function onDeletePointerDown(e) {
      if (e.pointerType === 'mouse' && e.button > 0) return
      deletePressRef.current = { id, pointerId: e.pointerId, x: e.clientX, y: e.clientY }
    }

    // The finger (or mouse button) lifting off the button it went down on,
    // without having slid away, is the tap.
    function onDeletePointerUp(e) {
      const press = deletePressRef.current
      deletePressRef.current = null
      if (!press || press.id !== id || press.pointerId !== e.pointerId) return
      if (Math.abs(e.clientX - press.x) >= DRAG_THRESHOLD || Math.abs(e.clientY - press.y) >= DRAG_THRESHOLD) return
      e.stopPropagation()
      remove()
      // Armed after onDelete returns: a confirm() it opens can stay up as
      // long as the person likes, and the click only follows once it closes.
      swallowNextClick()
    }

    function onDeleteClick(e) {
      e.stopPropagation()
      remove()
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
      deleteButton: {
        onPointerDown: onDeletePointerDown,
        onPointerUp: onDeletePointerUp,
        onPointerCancel: () => {
          deletePressRef.current = null
        },
        onClick: onDeleteClick,
      },
      isOpen,
    }
  }

  return { bind, close }
}
