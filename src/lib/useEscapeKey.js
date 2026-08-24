import { useEffect } from 'react'

// Closes something (a panel, a menu) when Escape is pressed, while it's
// open — `active` is the same on/off flag every caller already has for its
// own open state, not a separate thing to track. Companion to
// useClickOutside for things that don't have a natural "outside" to click:
// an inline panel toggled by its own button (GroupView.jsx's filters
// panel) rather than a floating popover. useClickOutside itself uses this
// under the hood for the popovers it does cover, so there's exactly one
// place Escape-handling actually lives.
export function useEscapeKey(onEscape, active) {
  useEffect(() => {
    if (!active) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') onEscape()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [active, onEscape])
}
