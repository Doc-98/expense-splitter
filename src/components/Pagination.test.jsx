import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import Pagination from './Pagination'

// jsdom doesn't implement scrollTo (logs a "not implemented" warning rather
// than throwing) — Pagination's own scroll-preservation effect calls it
// whenever jsdom's zero-height layout makes goToPage() think the pill was
// docked at the bottom, which is every click in this environment. Stubbed
// so the click-through tests below don't spam that warning.
beforeEach(() => {
  window.scrollTo = vi.fn()
})

// Pagination's `setPage` prop is a real setState updater (`setPage((p) =>
// ...)`), not a plain callback — this thin wrapper gives it a real page
// state to update, the same shape every actual caller (GroupView.jsx,
// History.jsx) passes in, so clicking through it exercises the same
// clamping logic a real page does rather than just asserting on mock
// call arguments.
function PaginationHarness({ totalItems, pageSize, floating }) {
  const [page, setPage] = useState(0)
  return <Pagination page={page} setPage={setPage} totalItems={totalItems} pageSize={pageSize} floating={floating} />
}

describe('Pagination', () => {
  it('renders nothing when everything fits on one page', () => {
    const { container } = render(<PaginationHarness totalItems={5} pageSize={10} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when totalItems exactly fills one page', () => {
    const { container } = render(<PaginationHarness totalItems={10} pageSize={10} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the current page out of the total, and disables Prev on the first page', () => {
    render(<PaginationHarness totalItems={25} pageSize={10} />)
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
    expect(screen.getByLabelText('Previous page')).toBeDisabled()
    expect(screen.getByLabelText('Next page')).not.toBeDisabled()
  })

  it('advances the page on Next and disables Next on the last page', async () => {
    const user = userEvent.setup({ delay: null })
    render(<PaginationHarness totalItems={25} pageSize={10} />)

    await user.click(screen.getByLabelText('Next page'))
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()

    await user.click(screen.getByLabelText('Next page'))
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument()
    expect(screen.getByLabelText('Next page')).toBeDisabled()
  })

  it('goes back on Prev', async () => {
    const user = userEvent.setup({ delay: null })
    render(<PaginationHarness totalItems={25} pageSize={10} />)

    await user.click(screen.getByLabelText('Next page'))
    await user.click(screen.getByLabelText('Previous page'))
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
    expect(screen.getByLabelText('Previous page')).toBeDisabled()
  })

  it('uses the inline (non-floating) class when floating is false', () => {
    const { container } = render(<PaginationHarness totalItems={25} pageSize={10} floating={false} />)
    const pill = container.querySelector('.pagination')
    expect(pill).toHaveClass('pagination-inline')
  })

  it('defaults to the floating-only class when floating is not passed', () => {
    const { container } = render(<PaginationHarness totalItems={25} pageSize={10} />)
    const pill = container.querySelector('.pagination')
    expect(pill).not.toHaveClass('pagination-inline')
  })
})
