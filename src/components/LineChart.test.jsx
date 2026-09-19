import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LineChart from './LineChart'

const format = (n) => `€${n.toFixed(2)}`

function makePoints(n) {
  return Array.from({ length: n }, (_, i) => ({ key: `k${i}`, label: `p${i}`, amount: (i + 1) * 10 }))
}

describe('LineChart — empty', () => {
  it('shows an empty state with no points', () => {
    render(<LineChart points={[]} format={format} />)
    expect(screen.getByText('No bills in this period')).toBeInTheDocument()
  })
})

describe('LineChart — with data', () => {
  it('labels the top of the chart with the formatted real max, not a divide-by-zero fallback', () => {
    render(<LineChart points={[{ key: 'a', label: 'Mon', amount: 0 }]} format={format} />)
    expect(screen.getByText('€0.00')).toBeInTheDocument() // honest zero, not a phantom €1.00
  })

  it('always shows the first and last x-axis labels', () => {
    render(<LineChart points={makePoints(3)} format={format} />)
    expect(screen.getByText('p0')).toBeInTheDocument()
    expect(screen.getByText('p2')).toBeInTheDocument()
  })

  it('skips labels in between once there are more points than fit', () => {
    render(<LineChart points={makePoints(10)} format={format} />)
    // labelStep = ceil(10 / 7) = 2 — every other index, plus the last
    expect(screen.getByText('p0')).toBeInTheDocument()
    expect(screen.getByText('p2')).toBeInTheDocument()
    expect(screen.getByText('p4')).toBeInTheDocument()
    expect(screen.getByText('p9')).toBeInTheDocument() // last, even though 9 isn't a multiple of 2
    expect(screen.queryByText('p1')).not.toBeInTheDocument()
    expect(screen.queryByText('p3')).not.toBeInTheDocument()
  })

  it('gives each point an accessible hover/tap target with its label and amount', () => {
    render(<LineChart points={makePoints(3)} format={format} />)
    expect(screen.getByRole('button', { name: 'p0: €10.00' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'p1: €20.00' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'p2: €30.00' })).toBeInTheDocument()
  })

  it('shows a tooltip for the active point on hover, and hides it on mouse leave', () => {
    render(<LineChart points={makePoints(3)} format={format} />)
    expect(screen.queryByText('€20.00', { selector: '.line-chart-tooltip-amount' })).not.toBeInTheDocument()

    const target = screen.getByRole('button', { name: 'p1: €20.00' })
    fireEvent.mouseEnter(target)
    expect(screen.getByText('€20.00', { selector: '.line-chart-tooltip-amount' })).toBeInTheDocument()
    expect(screen.getByText('p1', { selector: '.line-chart-tooltip-label' })).toBeInTheDocument()

    fireEvent.mouseLeave(target)
    expect(screen.queryByText('€20.00', { selector: '.line-chart-tooltip-amount' })).not.toBeInTheDocument()
  })

  it('shows the tooltip on keyboard focus too, and hides it on blur', () => {
    render(<LineChart points={makePoints(3)} format={format} />)
    const target = screen.getByRole('button', { name: 'p0: €10.00' })

    fireEvent.focus(target)
    expect(screen.getByText('p0', { selector: '.line-chart-tooltip-label' })).toBeInTheDocument()

    fireEvent.blur(target)
    expect(screen.queryByText('p0', { selector: '.line-chart-tooltip-label' })).not.toBeInTheDocument()
  })

  it('renders a single point without crashing, with no line to draw', () => {
    render(<LineChart points={[{ key: 'a', label: 'Mon', amount: 42 }]} format={format} />)
    expect(screen.getByRole('button', { name: 'Mon: €42.00' })).toBeInTheDocument()
  })
})
