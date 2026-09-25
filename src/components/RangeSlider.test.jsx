import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RangeSlider from './RangeSlider'

function renderSlider(props) {
  return render(
    <RangeSlider min={0} max={100} valueMin={20} valueMax={80} onChangeMin={vi.fn()} onChangeMax={vi.fn()} {...props} />
  )
}

describe('RangeSlider — dragging', () => {
  it('renders both handles at their given values', () => {
    renderSlider()
    expect(screen.getByLabelText('Minimum amount', { selector: 'input' })).toHaveValue('20')
    expect(screen.getByLabelText('Maximum amount', { selector: 'input' })).toHaveValue('80')
  })

  it('calls onChangeMin, clamped so it never passes the current max', () => {
    const onChangeMin = vi.fn()
    renderSlider({ onChangeMin })
    const minInput = screen.getByLabelText('Minimum amount', { selector: 'input' })

    fireChange(minInput, '50')
    expect(onChangeMin).toHaveBeenCalledWith(50)

    fireChange(minInput, '95') // past valueMax (80) — clamps to it
    expect(onChangeMin).toHaveBeenLastCalledWith(80)
  })

  it('calls onChangeMax, clamped so it never passes the current min', () => {
    const onChangeMax = vi.fn()
    renderSlider({ onChangeMax })
    const maxInput = screen.getByLabelText('Maximum amount', { selector: 'input' })

    fireChange(maxInput, '50')
    expect(onChangeMax).toHaveBeenCalledWith(50)

    fireChange(maxInput, '5') // below valueMin (20) — clamps to it
    expect(onChangeMax).toHaveBeenLastCalledWith(20)
  })
})

describe('RangeSlider — typing an exact amount', () => {
  it('saves a typed min via its own InlineEditable label, clamped to [min, valueMax]', async () => {
    const user = userEvent.setup({ delay: null })
    const onChangeMin = vi.fn()
    renderSlider({ onChangeMin })

    await user.click(screen.getByLabelText('Minimum amount', { selector: 'button' }))
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), '30')
    await user.keyboard('{Enter}')
    expect(onChangeMin).toHaveBeenCalledWith(30)
  })

  it('clamps a typed min below the slider floor up to min', async () => {
    const user = userEvent.setup({ delay: null })
    const onChangeMin = vi.fn()
    renderSlider({ onChangeMin })

    await user.click(screen.getByLabelText('Minimum amount', { selector: 'button' }))
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), '-10')
    await user.keyboard('{Enter}')
    expect(onChangeMin).toHaveBeenCalledWith(0)
  })

  it('clamps a typed min above the current max down to valueMax', async () => {
    const user = userEvent.setup({ delay: null })
    const onChangeMin = vi.fn()
    renderSlider({ onChangeMin })

    await user.click(screen.getByLabelText('Minimum amount', { selector: 'button' }))
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), '999')
    await user.keyboard('{Enter}')
    expect(onChangeMin).toHaveBeenCalledWith(80)
  })

  it('saves a typed max, clamped to [valueMin, max]', async () => {
    const user = userEvent.setup({ delay: null })
    const onChangeMax = vi.fn()
    renderSlider({ onChangeMax })

    await user.click(screen.getByLabelText('Maximum amount', { selector: 'button' }))
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), '500')
    await user.keyboard('{Enter}')
    expect(onChangeMax).toHaveBeenCalledWith(100) // clamped to the slider's own max

    await user.click(screen.getByLabelText('Maximum amount', { selector: 'button' }))
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), '5')
    await user.keyboard('{Enter}')
    expect(onChangeMax).toHaveBeenLastCalledWith(20) // clamped up to valueMin
  })

  it('ignores an unparseable typed value', async () => {
    const user = userEvent.setup({ delay: null })
    const onChangeMin = vi.fn()
    renderSlider({ onChangeMin })

    await user.click(screen.getByLabelText('Minimum amount', { selector: 'button' }))
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'abc')
    await user.keyboard('{Enter}')
    expect(onChangeMin).not.toHaveBeenCalled()
  })

  it('formats the displayed labels when a format function is given', () => {
    renderSlider({ format: (n) => `€${n.toFixed(2)}` })
    // The label buttons' accessible name is their aria-label ("Minimum
    // amount"/"Maximum amount", for a screen reader), not their formatted
    // display text — same as InlineEditable's own display/ariaLabel split
    // — so the formatted amount is checked via text content instead.
    expect(screen.getByRole('button', { name: 'Minimum amount' })).toHaveTextContent('€20.00')
    expect(screen.getByRole('button', { name: 'Maximum amount' })).toHaveTextContent('€80.00')
  })
})

// jsdom doesn't support real pointer drags on <input type="range">, so a
// value change is simulated the way RTL recommends for any controlled
// input — fireEvent.change() sets the value through the native setter
// (bypassing React's own value tracking) and dispatches the right event
// for React to pick up, same effect a drag would have on the handler that
// actually runs.
function fireChange(input, value) {
  fireEvent.change(input, { target: { value } })
}
