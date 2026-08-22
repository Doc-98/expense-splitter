import { parseNumber } from '../lib/parseNumber'
import InlineEditable from './InlineEditable'

// A two-handle range slider built from two overlapping native
// <input type="range"> elements rather than a custom-drawn control or a
// new dependency — each handle stays a real, keyboard-and-screen-reader
// operable range input; only the track's own default painting is hidden
// (see the CSS) so a custom fill between the two handles can be drawn
// underneath instead. This is the standard technique for a dual-range
// slider without a library: both inputs share the same footprint,
// pointer-events are limited to each input's own thumb (via CSS) so
// clicking the track passes through to whichever input's *thumb* is
// actually under the pointer, and each input clamps against the other's
// current value so the two handles can never cross.
//
// The two numbers below the track are the second way to set the range —
// click/tap one to type an exact amount instead of dragging, same
// InlineEditable interaction (and the same dotted-underline affordance)
// as editing an item's name or price on a bill. Typed values clamp the
// same way dragging does: a new min can't pass the current max and vice
// versa, and neither can leave the slider's own [min, max] bounds.
export default function RangeSlider({ min, max, step = 1, valueMin, valueMax, onChangeMin, onChangeMax, format }) {
  const span = Math.max(1, max - min) // guards divide-by-zero when min === max (a group with one bill total)
  const fillLeft = ((valueMin - min) / span) * 100
  const fillRight = 100 - ((valueMax - min) / span) * 100

  function saveMin(raw) {
    const parsed = parseNumber(raw)
    if (Number.isNaN(parsed)) return
    onChangeMin(Math.min(Math.max(parsed, min), valueMax))
  }

  function saveMax(raw) {
    const parsed = parseNumber(raw)
    if (Number.isNaN(parsed)) return
    onChangeMax(Math.max(Math.min(parsed, max), valueMin))
  }

  return (
    <div className="range-slider">
      <div className="range-slider-track">
        <div className="range-slider-fill" style={{ left: `${fillLeft}%`, right: `${fillRight}%` }} />
      </div>
      <input
        type="range"
        className="range-slider-input"
        min={min}
        max={max}
        step={step}
        value={valueMin}
        onChange={(e) => onChangeMin(Math.min(Number(e.target.value), valueMax))}
        aria-label="Minimum amount"
      />
      <input
        type="range"
        className="range-slider-input"
        min={min}
        max={max}
        step={step}
        value={valueMax}
        onChange={(e) => onChangeMax(Math.max(Number(e.target.value), valueMin))}
        aria-label="Maximum amount"
      />
      <div className="range-slider-labels">
        <InlineEditable
          className="mono item-editable range-slider-label"
          inputClassName="item-editable-input item-money-input"
          inputMode="decimal"
          value={String(valueMin)}
          display={format ? format(valueMin) : valueMin}
          onSave={saveMin}
          ariaLabel="Minimum amount"
        />
        <InlineEditable
          className="mono item-editable range-slider-label"
          inputClassName="item-editable-input item-money-input"
          inputMode="decimal"
          value={String(valueMax)}
          display={format ? format(valueMax) : valueMax}
          onSave={saveMax}
          ariaLabel="Maximum amount"
        />
      </div>
    </div>
  )
}
