import { categoryColor } from '../lib/categoryPalette'
import { useCurrency } from '../context/CurrencyContext'
import RangeSlider from './RangeSlider'

// The group page's search box and, below it, its filters panel (tags,
// match any/all, amount range). `filters` is what useBillFilters returns.
export default function BillSearchPanel({ filters, categories }) {
  const { format } = useCurrency()
  const {
    searchQuery,
    setSearchQuery,
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
    clearFilters,
  } = filters

  return (
    <>
      <div className="receipt-tape bill-search-tape">
        <input
          ref={searchInputRef}
          type="text"
          className="guide-search-input"
          placeholder="Search bills… (/)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search bills"
        />
        <button
          type="button"
          className={`btn-link bill-filter-toggle ${filtersActive ? 'bill-filter-toggle-active' : ''}`}
          onClick={() => setFiltersOpen((o) => !o)}
        >
          Filters{filtersActive ? ' •' : ''}
        </button>
        <button
          type="button"
          className="btn-icon bill-search-collapse"
          onClick={() => setSearchOpen(false)}
          aria-label="Hide search"
        >
          ↑
        </button>
      </div>

      {filtersOpen && (
        <div className="bill-filters-panel">
          {categories.length > 0 && (
            <div className="bill-filters-group">
              <div className="bill-filters-group-header">
                <span className="muted">Tags</span>
                <div className="tab-row bill-filters-tag-mode">
                  <button
                    type="button"
                    className={`tab ${tagMatchMode === 'any' ? 'active' : ''}`}
                    onClick={() => setTagMatchMode('any')}
                  >
                    Match any
                  </button>
                  <button
                    type="button"
                    className={`tab ${tagMatchMode === 'all' ? 'active' : ''}`}
                    onClick={() => setTagMatchMode('all')}
                  >
                    Match all
                  </button>
                </div>
              </div>
              <div className="chip-row">
                {categories.map((cat) => (
                  <label key={cat.id} className={`buyer-chip ${selectedTagIds.has(cat.id) ? 'active' : ''}`}>
                    <input type="checkbox" checked={selectedTagIds.has(cat.id)} onChange={() => toggleTag(cat.id)} />
                    <span className="category-dot" style={{ background: categoryColor(cat.color) }} />
                    {cat.name}
                  </label>
                ))}
                <label className={`buyer-chip ${selectedTagIds.has('uncategorized') ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selectedTagIds.has('uncategorized')}
                    onChange={() => toggleTag('uncategorized')}
                  />
                  Uncategorized
                </label>
              </div>
            </div>
          )}
          {priceBounds && priceRange && priceBounds.max > priceBounds.min && (
            <div className="bill-filters-group">
              <span className="muted">Amount</span>
              <RangeSlider
                min={priceBounds.min}
                max={priceBounds.max}
                valueMin={priceRange[0]}
                valueMax={priceRange[1]}
                onChangeMin={(v) => setPriceRange(([, hi]) => [v, hi])}
                onChangeMax={(v) => setPriceRange(([lo]) => [lo, v])}
                format={format}
              />
            </div>
          )}
          {(searchQuery || filtersActive) && (
            <button type="button" className="btn-link" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      )}
    </>
  )
}
