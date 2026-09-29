import { CATEGORY_COLORS, categoryColor } from '../lib/categoryPalette'

// One row of preset color swatches plus a native color picker for anything
// outside that small palette — shared by the "add category" form and, via
// CategoryColorButton, editing an existing category's color from its dot,
// so the two never drift into two different-looking pickers over time.
export default function ColorSwatchPicker({ value, onChange }) {
  const isCustom = !CATEGORY_COLORS.includes(String(value).toLowerCase())

  return (
    <div className="color-swatch-row">
      {CATEGORY_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={`color-swatch ${String(value).toLowerCase() === c ? 'selected' : ''}`}
          style={{ background: categoryColor(c) }}
          onClick={() => onChange(c)}
          aria-label={`Choose color ${c}`}
        />
      ))}
      {/* The browser's own color picker — covers anything the seven presets
          don't. Styled to look like one more circular swatch rather than
          the default square/bordered input most browsers render it as. */}
      <input
        type="color"
        className={`color-swatch color-swatch-custom ${isCustom ? 'selected' : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Choose a custom color"
        title="Custom color"
      />
    </div>
  )
}
