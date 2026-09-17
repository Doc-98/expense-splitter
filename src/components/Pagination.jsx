import { useLayoutEffect, useRef } from 'react'

// `floating` (default true) is the bill list's own pill: sticky to the
// bottom of the viewport while there's more page to scroll, docking in
// flow once you reach the real bottom (see the comment below). Pass
// `floating={false}` for a page's *second* paginated list on the same
// page (no current caller needs this — History.jsx, the last one that
// would have, is a whole page of its own now, not a secondary list
// sharing space with something else) — two independent sticky elements at
// the same `bottom` offset have no way to know about each other, so if
// both ever ended up "stuck" at once they'd render on top of each other.
// A secondary, already-tucked-away list doesn't really need to float
// anyway; a plain inline pager avoids the collision entirely instead of
// trying to prevent it.
export default function Pagination({ page, setPage, totalItems, pageSize, floating = true }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  // Set right before a Prev/Next click if the page was scrolled to its
  // true bottom at that moment — i.e. the pill was docked, not floating.
  // Left false otherwise (including after an external page reset, e.g. a
  // filter change elsewhere on the page, which never touches this at
  // all), so the effect below only ever acts right after one of *this*
  // pill's own buttons caused the page to change while docked. Not used
  // at all when `floating` is false — an inline pager has no docked/
  // floating distinction to preserve across a page swap in the first
  // place.
  const wasAtBottom = useRef(false)

  // The bug this exists for: .pagination is `position: sticky`, so once
  // you've scrolled to the actual bottom of a page it docks into its
  // ordinary in-flow spot instead of floating — exactly the point of
  // sticky, and fine on its own. But swapping to a different page's bills
  // right then changes how tall the list above it is, so the *document's*
  // bottom moves — and the browser doesn't re-scroll to keep you there,
  // so the pill (and everything below it) visibly jumps under your thumb
  // the instant you tap Next or Prev while docked.
  //
  // Re-scrolling by exactly however far the pill itself moved sounds like
  // the fix, but doesn't actually work: sticky's on-screen position isn't
  // a simple function of scroll offset once it's clamped to `bottom`, so
  // a page swap can flip it between "still floating" and "now docked"
  // partway through, and a single fixed scroll adjustment can't track
  // that. Snapping straight to the new page's own true bottom sidesteps
  // the whole problem — "docked" and "scrolled to the very bottom" are
  // the same state for a sticky-footer element like this one, on any
  // page, short or tall, so this is just "you were at the bottom, land
  // at the bottom again" rather than trying to preserve an exact pixel
  // position.
  //
  // Nothing to do when the pill *wasn't* docked (still floating,
  // mid-scroll through a long page) — floating position is already
  // scroll-offset-independent, so it stays exactly where it was on the
  // new page too, with no adjustment needed; if the new page turns out
  // shorter than the current scroll position, the browser clamps that on
  // its own during reflow, same as it always does.
  useLayoutEffect(() => {
    if (!floating || !wasAtBottom.current) return
    wasAtBottom.current = false
    window.scrollTo(0, document.documentElement.scrollHeight)
  }, [page, totalItems, floating])

  if (totalPages <= 1) return null

  function goToPage(next) {
    if (floating) {
      wasAtBottom.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
    }
    setPage(next)
  }

  return (
    <div className={floating ? 'pagination' : 'pagination pagination-inline'}>
      <button
        type="button"
        className="btn-icon"
        onClick={() => goToPage((p) => Math.max(0, p - 1))}
        disabled={page === 0}
        aria-label="Previous page"
      >
        ‹
      </button>
      <span className="pagination-label">
        Page {page + 1} of {totalPages}
      </span>
      <button
        type="button"
        className="btn-icon"
        onClick={() => goToPage((p) => Math.min(totalPages - 1, p + 1))}
        disabled={page >= totalPages - 1}
        aria-label="Next page"
      >
        ›
      </button>
    </div>
  )
}
