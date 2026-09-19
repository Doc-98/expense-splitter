import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import ComparisonBadge from './ComparisonBadge'

describe('ComparisonBadge', () => {
  it('renders nothing when both periods are zero', () => {
    const { container } = render(<ComparisonBadge comparison={{ changePercent: null, current: 0, previous: 0 }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows "new vs last period" when there is nothing to compare against', () => {
    render(<ComparisonBadge comparison={{ changePercent: null, current: 50, previous: 0 }} />)
    expect(screen.getByText('new vs last period')).toBeInTheDocument()
  })

  it('shows "same as last period" when the change is exactly zero', () => {
    render(<ComparisonBadge comparison={{ changePercent: 0, current: 50, previous: 50 }} />)
    expect(screen.getByText('same as last period')).toBeInTheDocument()
  })

  it('shows an increase in red with an up arrow', () => {
    render(<ComparisonBadge comparison={{ changePercent: 25, current: 125, previous: 100 }} />)
    const badge = screen.getByText(/25% vs last period/)
    expect(badge).toHaveTextContent('▲')
    expect(badge).toHaveClass('balance-negative')
  })

  it('shows a decrease in green with a down arrow, using the absolute percent', () => {
    render(<ComparisonBadge comparison={{ changePercent: -25, current: 75, previous: 100 }} />)
    const badge = screen.getByText(/25% vs last period/)
    expect(badge).toHaveTextContent('▼')
    expect(badge).toHaveClass('balance-positive')
    expect(badge).not.toHaveTextContent('-25%')
  })
})
