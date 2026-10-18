import { useEffect, useRef, useState } from 'react'
import { filterBills, billTotal } from './billFilters'
import { useEscapeKey } from './useEscapeKey'
import { isTypingTarget } from './isTypingTarget'
import { groupFilterStateCache } from './groupFilterState'

// The group page's search box and filters panel: what's typed, which tags
// and price range are picked, whether each is open, and the bills left
// once they're applied (filterBills, billFilters.js). With the Sticky
// filters preference on, all of it is kept per group in
// groupFilterStateCache, so opening a bill and coming back finds it as it
// was. `isConfirming` pauses the Escape handlers while a confirm sheet is
// up, same as the page's own.
export function useBillFilters({ groupId, bills, historyComplete, stickyFilters, isConfirming }) {
  // Only actually consulted when stickyFilters is on (see the state
  // declarations below and the write-back effect further down) —
  // groupFilterStateCache.js has the full reasoning for why this is
  // deliberately in-memory only, not mirrored to sessionStorage like most
  // of this app's other caches.
  const cachedFilters = stickyFilters ? groupFilterStateCache.get(groupId) : undefined

  // Every piece of filter-related state below seeds from cachedFilters
  // when stickyFilters is on and this group has a cached entry (a return
  // trip from a bill, most commonly) — otherwise the same plain defaults
  // as before this preference existed. See the write-back effect further
  // down for the other half of this.
  const [searchQuery, setSearchQuery] = useState(cachedFilters?.searchQuery ?? '')
  // Collapsed by default — a search bar plus a filters panel is a lot of
  // screen real estate for something you might not touch for a while if
  // you're just adding bills and settling up, not digging through old
  // ones. The search icon that opens it lives in the page's header row;
  // the section itself also carries its own ↑ to retract (see
  // BillSearchPanel.jsx), and "/" opens it too (see the keydown effect
  // below), matching whichever way it was closed.
  const [searchOpen, setSearchOpen] = useState(cachedFilters?.searchOpen ?? false)
  // Same Escape-to-close convention as the filters panel just below — an
  // inline panel toggled by its own button, same shape as filtersOpen, so
  // it gets the same treatment.
  useEscapeKey(() => setSearchOpen(false), searchOpen && !isConfirming)
  // "/" jumps straight to this (see the keydown effect below), same
  // shortcut GitHub/Slack use for their own search boxes — so it needs a
  // real DOM node to call .focus() on, not just the value/onChange state
  // every other input on this page gets away with.
  const searchInputRef = useRef(null)
  // Focuses the search box the moment it actually mounts — searchOpen and
  // the ref becoming usable happen a render apart, so the keydown handler
  // below can't just call .focus() straight after setSearchOpen(true) and
  // expect the DOM node to already exist yet. Also fires on a sticky-
  // filters remount that restores an already-open search box — harmless,
  // just re-focuses it same as opening it fresh would.
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])
  const [filtersOpen, setFiltersOpen] = useState(cachedFilters?.filtersOpen ?? false)
  useEscapeKey(() => setFiltersOpen(false), filtersOpen && !isConfirming)
  const [selectedTagIds, setSelectedTagIds] = useState(cachedFilters?.selectedTagIds ?? new Set())
  const [tagMatchMode, setTagMatchMode] = useState(cachedFilters?.tagMatchMode ?? 'any')
  // null until initialized from real data (see the effect below) — the
  // slider has nothing to show until there's at least one bill to derive
  // bounds from. Once set, a new pricier bill coming in later doesn't
  // silently widen a range someone already narrowed on purpose. A
  // restored non-null value from cachedFilters skips that initialization
  // the same way an already-set one does — see that effect's own guard.
  const [priceRange, setPriceRange] = useState(cachedFilters?.priceRange ?? null)

  const priceBounds =
    bills && bills.length > 0 ? { min: 0, max: Math.max(1, Math.ceil(Math.max(...bills.map(billTotal)))) } : null
  const priceFilterActive = Boolean(
    priceBounds && priceRange && (priceRange[0] > priceBounds.min || priceRange[1] < priceBounds.max)
  )
  const filtersActive = selectedTagIds.size > 0 || priceFilterActive
  // Search/tags/price all apply before pagination — Pagination and the
  // month/day grouping only ever see whatever's left after filtering, same
  // as they only ever saw the full list before this feature existed.
  const filteredBills = bills
    ? filterBills(bills, {
        query: searchQuery,
        tagIds: selectedTagIds,
        tagMode: tagMatchMode,
        minPrice: priceRange ? priceRange[0] : null,
        maxPrice: priceRange ? priceRange[1] : null,
      })
    : []

  // "/" jumps straight to the search box, from anywhere on the page —
  // independent of the list's own keyboard navigation (works in select
  // mode, or with zero bills currently matching a filter, since the box
  // itself is still there to change either of those). Opens the search
  // section first if it's currently collapsed — the useEffect above
  // handles actually focusing it once it's mounted; the direct .focus()
  // call here is for the already-open case, where there's no mount to
  // wait on.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== '/' || isTypingTarget(document.activeElement)) return
      e.preventDefault()
      setSearchOpen(true)
      searchInputRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // The write half of the Sticky filters preference (see cachedFilters
  // above) — keeps groupFilterStateCache current with exactly what's on
  // screen so a later remount of this same group (opening a bill, then
  // coming back) can restore it. A no-op whenever the preference is off,
  // same as every write below it would otherwise do nothing useful with.
  // The page of results deliberately isn't part of this — only the actual
  // filter criteria are "sticky," not which page you'd scrolled to.
  useEffect(() => {
    if (!stickyFilters) return
    groupFilterStateCache.set(groupId, {
      searchQuery,
      searchOpen,
      filtersOpen,
      selectedTagIds,
      tagMatchMode,
      priceRange,
    })
  }, [stickyFilters, groupId, searchQuery, searchOpen, filtersOpen, selectedTagIds, tagMatchMode, priceRange])

  // Initializes the price slider from real data exactly once bills first
  // load — see the priceRange state comment above for why a later reload
  // (a new, pricier bill coming in) deliberately doesn't touch it again.
  // Gated on historyComplete, not just `bills` being non-empty: bills can
  // already be non-empty from the first-paint windowed preview (see
  // useGroupViewData.js), and initializing the slider's max off of just
  // that would silently exclude a pricier bill outside the window from
  // ever showing up in a price-filtered search, forever, even once the
  // real backfill lands — this waits for the real, complete picture
  // instead, same reasoning as settlement.
  useEffect(() => {
    if (priceRange !== null || !bills || bills.length === 0 || !historyComplete) return
    setPriceRange([0, Math.max(1, Math.ceil(Math.max(...bills.map(billTotal))))])
  }, [bills, priceRange, historyComplete])

  function toggleTag(tagId) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }

  function clearFilters() {
    setSearchQuery('')
    setSelectedTagIds(new Set())
    setTagMatchMode('any')
    if (priceBounds) setPriceRange([priceBounds.min, priceBounds.max])
  }

  return {
    searchQuery,
    setSearchQuery,
    searchOpen,
    setSearchOpen,
    searchInputRef,
    filtersOpen,
    setFiltersOpen,
    selectedTagIds,
    toggleTag,
    tagMatchMode,
    setTagMatchMode,
    priceBounds,
    priceRange,
    setPriceRange,
    filtersActive,
    filteredBills,
    clearFilters,
  }
}
