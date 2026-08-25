import { useRef, useState } from 'react'
import { useClickOutside } from '../lib/useClickOutside'
import ColorSwatchPicker from './ColorSwatchPicker'

// The colored dot next to a category name doubles as its color editor —
// click it to reopen the same swatch row shown when the category was first
// created, pick a new one (preset or custom), and it's saved right away.
// No separate save step, and the popover stays open after a pick (same
// convention as every other popover in the app, e.g. InviteMenu) so
// changing your mind a second time doesn't mean reopening it — click
// outside or press Escape when you're done.
export default function CategoryColorButton({ color, onChangeColor }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useClickOutside(wrapRef, () => setOpen(false), open)

  return (
    <span className="category-color-picker-wrap" ref={wrapRef}>
      <button
        type="button"
        className="category-dot category-dot-button"
        style={{ background: color }}
        onClick={() => setOpen((o) => !o)}
        aria-label="Change category color"
        aria-expanded={open}
      />
      {open && (
        <div className="category-color-popover">
          <ColorSwatchPicker value={color} onChange={onChangeColor} />
        </div>
      )}
    </span>
  )
}
