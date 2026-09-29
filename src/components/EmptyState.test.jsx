import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import EmptyState from './EmptyState'
import { ReceiptIcon } from './icons'

describe('EmptyState', () => {
  it('shows the title, the explanation, the next step and a note', () => {
    render(
      <EmptyState icon={ReceiptIcon} title="No bills yet" action={<button type="button">Add a bill</button>} note="A note">
        Add the first one.
      </EmptyState>,
    )
    expect(screen.getByText('No bills yet')).toBeInTheDocument()
    expect(screen.getByText('Add the first one.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a bill' })).toBeInTheDocument()
    expect(screen.getByText('A note')).toBeInTheDocument()
  })

  it('keeps the icon out of the accessibility tree', () => {
    const { container } = render(<EmptyState icon={ReceiptIcon} title="No bills yet" />)
    expect(container.querySelector('.empty-card-icon')).toHaveAttribute('aria-hidden', 'true')
  })
})
