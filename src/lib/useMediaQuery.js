import { useEffect, useState } from 'react'

// Whether a CSS media query matches right now, kept current as the window
// is resized or a tablet rotates. False where matchMedia doesn't exist
// (tests, very old browsers), so callers fall back to the phone layout.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const update = () => setMatches(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [query])
  return matches
}
