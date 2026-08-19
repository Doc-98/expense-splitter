import { useEffect } from 'react'

// Closes a popover when clicking/tapping anywhere outside the element the
// ref is attached to. That ref needs to wrap the *whole* thing — trigger
// button included, not just the popover panel — or clicking the trigger
// itself would count as "outside" and immediately re-close what its own
// onClick just opened.
export function useClickOutside(ref, onOutside, active) {
  useEffect(() => {
    if (!active) return

    function handlePointerDown(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        onOutside()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [active, ref, onOutside])
}
