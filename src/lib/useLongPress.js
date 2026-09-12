import { useCallback, useRef } from 'react'

// A press-and-hold gesture — call the hook once, then call the `bind`
// function it returns once per element/row that needs one, passing that
// row's own action. One shared timer/ref set is enough regardless of how
// many rows use it: only one row can ever be mid-press at a time, so
// there's nothing to keep per-row.
//
// Pointer Events (not a separate touchstart/mousedown pair, unlike this
// file's useClickOutside.js sibling) cover touch, mouse, and pen with one
// set of listeners — safe here specifically because nothing else on the
// element also listens for the legacy touch/mouse events pointer events
// stand in for, so there's no risk of the same press firing twice through
// two different event families.
//
// A long press swallows the click that still follows the eventual
// pointerup (`onClick` here checks a "did this press already fire" flag) —
// without that, releasing after a long-press-triggered action would *also*
// run whatever a plain tap does (e.g. navigating a link).
export function useLongPress({ delay = 500, moveTolerance = 10, vibrate = true } = {}) {
  const timerRef = useRef(null)
  const firedRef = useRef(false)
  const startRef = useRef({ x: 0, y: 0 })

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const bind = useCallback(
    (onLongPress) => ({
      onPointerDown: (e) => {
        // Ignore a right-click/secondary mouse button — only the primary
        // button (or a real touch/pen contact, which reports button -1
        // for a plain press) should ever start this.
        if (e.button > 0) return
        firedRef.current = false
        startRef.current = { x: e.clientX, y: e.clientY }
        clear()
        timerRef.current = setTimeout(() => {
          firedRef.current = true
          if (vibrate) navigator.vibrate?.(15)
          onLongPress()
        }, delay)
      },
      // A real long-press hold shouldn't drift — scrolling the page (a
      // finger dragging, not holding still) cancels it rather than firing
      // partway through a scroll gesture.
      onPointerMove: (e) => {
        const dx = e.clientX - startRef.current.x
        const dy = e.clientY - startRef.current.y
        if (Math.hypot(dx, dy) > moveTolerance) clear()
      },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
      onClick: (e) => {
        if (firedRef.current) {
          e.preventDefault()
          e.stopPropagation()
          firedRef.current = false
        }
      },
      // This app's PWA is still, underneath, a web page — every element
      // this binds to so far is a real <a> (a bill row's Link), and a
      // press-and-hold on a link is *also* what the OS itself listens
      // for: its own "Open in new tab / Copy Link / Share" callout,
      // fighting this gesture for the same press. Android fires a real,
      // cancelable `contextmenu` DOM event once a touch crosses roughly
      // this same hold duration, regardless of whether this hook's own
      // timer already won the race — suppressed here so it never shows
      // for an element this is bound to. iOS Safari doesn't route its
      // equivalent callout through `contextmenu` at all; that half needs
      // a CSS `-webkit-touch-callout: none` on the element itself (see
      // wherever `bind()` is actually used — e.g. GroupView.jsx's bill
      // rows), which this hook has no element of its own to attach.
      onContextMenu: (e) => e.preventDefault(),
    }),
    [clear, delay, moveTolerance, vibrate]
  )

  return bind
}
