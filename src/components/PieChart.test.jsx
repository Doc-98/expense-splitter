import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PieChart from './PieChart'

const format = (n) => `€${n.toFixed(2)}`

const SLICES = [
  { key: 'food', name: 'Food', color: '#ff0000', amount: 30 },
  { key: 'drinks', name: 'Drinks', color: '#00ff00', amount: 70 },
]

describe('PieChart — empty', () => {
  it('shows an empty state when the total is zero', () => {
    render(<PieChart slices={[]} format={format} />)
    expect(screen.getByText('No spending in this period')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'No spending in this period' })).toBeInTheDocument()
  })

  it('shows an empty state when every slice is zero too', () => {
    render(<PieChart slices={[{ key: 'food', name: 'Food', color: '#ff0000', amount: 0 }]} format={format} />)
    expect(screen.getByText('No spending in this period')).toBeInTheDocument()
  })
})

describe('PieChart — with data', () => {
  it('renders a legend row per slice, largest first, with amount and percent', () => {
    render(<PieChart slices={SLICES} format={format} />)

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Drinks') // 70 > 30, sorted largest first
    expect(rows[0]).toHaveTextContent('€70.00')
    expect(rows[0]).toHaveTextContent('70%')
    expect(rows[1]).toHaveTextContent('Food')
    expect(rows[1]).toHaveTextContent('30%')
  })

  it('excludes zero-amount slices from the chart and legend', () => {
    render(
      <PieChart
        slices={[...SLICES, { key: 'transport', name: 'Transport', color: '#0000ff', amount: 0 }]}
        format={format}
      />
    )
    expect(screen.queryByText('Transport')).not.toBeInTheDocument()
  })

  it('shows the formatted grand total in the middle of the donut', () => {
    render(<PieChart slices={SLICES} format={format} />)
    expect(screen.getByText('€100.00')).toBeInTheDocument()
    expect(screen.getByText('Total')).toBeInTheDocument()
  })

  it('labels each wedge with its name, amount, and rounded percent', () => {
    render(<PieChart slices={SLICES} format={format} />)
    expect(screen.getByLabelText('Drinks: €70.00 (70%)')).toBeInTheDocument()
    expect(screen.getByLabelText('Food: €30.00 (30%)')).toBeInTheDocument()
  })

  it('is read-only (wedges get no button role, legend buttons are disabled) when onSelectCategory is omitted', () => {
    render(<PieChart slices={SLICES} format={format} />)
    // A disabled <button> keeps its "button" role (ARIA role isn't
    // conditional on disabled state), so the real read-only signal here is
    // that the *only* role="button" elements at all are the two legend
    // rows — the wedges themselves get no role (and no aria-label-based
    // name) once onSelectCategory is omitted.
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(2)
    expect(buttons.every((b) => b.disabled)).toBe(true)
  })

  it('calls onSelectCategory with the slice key on wedge click', async () => {
    const user = userEvent.setup({ delay: null })
    const onSelectCategory = vi.fn()
    render(<PieChart slices={SLICES} format={format} onSelectCategory={onSelectCategory} />)

    // The wedge's aria-label is a literal attribute (exact match, no
    // ambiguity) — the legend row's own accessible name is computed from
    // its content instead (three adjacent <span>s with no whitespace text
    // node between them in the JSX), which is exactly the kind of
    // accidental-concatenation trap MultiPayerModal.test.jsx already ran
    // into — so the legend click below is scoped via its <li> instead of
    // asserted on by name.
    await user.click(screen.getByRole('button', { name: 'Drinks: €70.00 (70%)' }))
    expect(onSelectCategory).toHaveBeenCalledWith('drinks')
  })

  it('calls onSelectCategory with the slice key on legend row click', async () => {
    const user = userEvent.setup({ delay: null })
    const onSelectCategory = vi.fn()
    render(<PieChart slices={SLICES} format={format} onSelectCategory={onSelectCategory} />)

    const foodRow = screen.getByText('Food', { selector: '.pie-chart-legend-name' }).closest('li')
    await user.click(within(foodRow).getByRole('button'))
    expect(onSelectCategory).toHaveBeenCalledWith('food')
  })

  it('prints the percent outside the ring for slices big enough to label, and not for slivers', () => {
    const { container } = render(
      <PieChart slices={[...SLICES, { key: 'tip', name: 'Tip', color: '#0000ff', amount: 2 }]} format={format} />
    )
    const labels = [...container.querySelectorAll('.pie-chart-percent')].map((t) => t.textContent)
    expect(labels).toEqual(['69%', '29%']) // Tip is 2% of 102: legend only
    expect(screen.getByText('2%', { selector: '.pie-chart-legend-percent' })).toBeInTheDocument()
  })

  it('highlights a slice and its legend row together, and names it in the centre, on hover', async () => {
    const user = userEvent.setup({ delay: null })
    const { container } = render(<PieChart slices={SLICES} format={format} />)
    const foodRow = screen.getByText('Food', { selector: '.pie-chart-legend-name' }).closest('li')

    await user.hover(foodRow)
    expect(foodRow).toHaveClass('active')
    expect(container.querySelector('.pie-chart-slice.active')).toHaveAttribute('aria-label', 'Food: €30.00 (30%)')
    expect(container.querySelector('.pie-chart-center-name')).toHaveTextContent('Food')
    expect(screen.getByText('30% of €100.00')).toBeInTheDocument()

    await user.unhover(foodRow)
    expect(foodRow).not.toHaveClass('active')
    expect(screen.getByText('Total')).toBeInTheDocument()
  })

  it('keeps the chosen category highlighted (no hover on a phone), and choosing it again clears it', async () => {
    const user = userEvent.setup({ delay: null })
    const onSelectCategory = vi.fn()
    const { container } = render(
      <PieChart slices={SLICES} format={format} selectedKey="drinks" onSelectCategory={onSelectCategory} />
    )
    const drinks = screen.getByRole('button', { name: 'Drinks: €70.00 (70%)' })
    expect(drinks).toHaveClass('active')
    expect(drinks).toHaveAttribute('aria-pressed', 'true')
    expect(container.querySelector('.pie-chart-center-name')).toHaveTextContent('Drinks')

    await user.click(drinks)
    expect(onSelectCategory).toHaveBeenCalledWith('')
  })

  it('cuts a long category name to fit inside the ring', async () => {
    const user = userEvent.setup({ delay: null })
    const { container } = render(
      <PieChart slices={[{ key: 'b', name: 'Bills & utilities and more', color: '#ff0000', amount: 5 }]} format={format} />
    )
    await user.hover(screen.getByText('Bills & utilities and more').closest('li'))
    expect(container.querySelector('.pie-chart-center-name')).toHaveTextContent('Bills & utili…')
  })
})
