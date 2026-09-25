import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ShareButton from './ShareButton'

function stubShare(impl) {
  Object.defineProperty(navigator, 'share', { value: impl, configurable: true })
}
function stubClipboard(impl) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: impl }, configurable: true })
}

beforeEach(() => {
  // jsdom's own window.print is a no-op that logs a "Not implemented"
  // warning rather than actually doing nothing quietly — stubbed here so
  // downloadAsPdf()'s call can be asserted on cleanly instead.
  vi.stubGlobal('print', vi.fn())
})

afterEach(() => {
  delete navigator.share
  delete navigator.clipboard
  vi.unstubAllGlobals()
})

describe('ShareButton — menu contents', () => {
  it('shows "Share as text" and "Download as PDF" only when getText is given', async () => {
    const user = userEvent.setup()
    render(<ShareButton getText={() => 'text'} title="Recap" />)
    await user.click(screen.getByRole('button', { name: 'Share' }))

    expect(screen.getByRole('button', { name: 'Share as text' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download as PDF' })).toBeInTheDocument()
  })

  it('shows only the CSV item when onExportCsv is given without getText', async () => {
    const user = userEvent.setup()
    render(<ShareButton onExportCsv={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Share' }))

    expect(screen.queryByRole('button', { name: 'Share as text' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Download as PDF' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export as CSV' })).toBeInTheDocument()
  })

  it('uses a custom csvLabel when given', async () => {
    const user = userEvent.setup()
    render(<ShareButton onExportCsv={vi.fn()} csvLabel="Download transactions" />)
    await user.click(screen.getByRole('button', { name: 'Share' }))
    expect(screen.getByRole('button', { name: 'Download transactions' })).toBeInTheDocument()
  })

  it('uses a custom trigger label', async () => {
    render(<ShareButton getText={() => 'text'} label="Export" />)
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument()
  })
})

describe('ShareButton — icon mode', () => {
  it('renders an icon-only trigger with the label as its accessible name and title', () => {
    render(<ShareButton getText={() => 'text'} label="Share recap" icon />)
    const trigger = screen.getByRole('button', { name: 'Share recap' })
    expect(trigger).toHaveAttribute('title', 'Share recap')
    expect(trigger).not.toHaveTextContent('Share recap') // icon, not the label text itself
  })

  it('renders the plain text label (no aria-label/title) when icon is false', () => {
    render(<ShareButton getText={() => 'text'} label="Share recap" />)
    const trigger = screen.getByRole('button', { name: 'Share recap' })
    expect(trigger).not.toHaveAttribute('title')
    expect(trigger).toHaveTextContent('Share recap')
  })
})

describe('ShareButton — menu alignment', () => {
  it('adds the right-aligned class only when menuAlign is "right"', async () => {
    const user = userEvent.setup()
    const { container, rerender } = render(<ShareButton getText={() => 'text'} />)
    await user.click(screen.getByRole('button', { name: 'Share' }))
    expect(container.querySelector('.share-menu-popover')).not.toHaveClass('share-menu-popover-right')

    rerender(<ShareButton getText={() => 'text'} menuAlign="right" />)
    expect(container.querySelector('.share-menu-popover')).toHaveClass('share-menu-popover-right')
  })
})

describe('ShareButton — actions', () => {
  it('shares the result of getText() and title via navigator.share, closing the menu', async () => {
    const user = userEvent.setup()
    const share = vi.fn().mockResolvedValue(undefined)
    stubShare(share)
    render(<ShareButton getText={() => 'January recap: €120.00'} title="Your January recap" />)

    await user.click(screen.getByRole('button', { name: 'Share' }))
    await user.click(screen.getByRole('button', { name: 'Share as text' }))

    expect(share).toHaveBeenCalledWith({ title: 'Your January recap', text: 'January recap: €120.00' })
    expect(screen.queryByRole('button', { name: 'Share as text' })).not.toBeInTheDocument() // menu closed
  })

  it('falls back to the clipboard with a status message when navigator.share is unavailable', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    render(<ShareButton getText={() => 'recap text'} title="Recap" />)

    await user.click(screen.getByRole('button', { name: 'Share' }))
    await user.click(screen.getByRole('button', { name: 'Share as text' }))

    expect(writeText).toHaveBeenCalledWith('recap text')
    expect(await screen.findByText('Copied to clipboard!')).toBeInTheDocument()
  })

  it("says so when the text can't be shared or copied", async () => {
    const user = userEvent.setup()
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')))
    render(<ShareButton getText={() => 'recap text'} title="Recap" />)

    await user.click(screen.getByRole('button', { name: 'Share' }))
    await user.click(screen.getByRole('button', { name: 'Share as text' }))

    expect(await screen.findByText(/Couldn't share or copy this/)).toBeInTheDocument()
  })

  it('calls window.print() and closes the menu on "Download as PDF"', async () => {
    const user = userEvent.setup()
    render(<ShareButton getText={() => 'text'} title="Recap" />)

    await user.click(screen.getByRole('button', { name: 'Share' }))
    await user.click(screen.getByRole('button', { name: 'Download as PDF' }))

    expect(window.print).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Download as PDF' })).not.toBeInTheDocument()
  })

  it('calls onExportCsv and closes the menu on the CSV item', async () => {
    const user = userEvent.setup()
    const onExportCsv = vi.fn()
    render(<ShareButton onExportCsv={onExportCsv} />)

    await user.click(screen.getByRole('button', { name: 'Share' }))
    await user.click(screen.getByRole('button', { name: 'Export as CSV' }))

    expect(onExportCsv).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Export as CSV' })).not.toBeInTheDocument()
  })

  it('closes on an outside click', async () => {
    const user = userEvent.setup()
    render(<ShareButton getText={() => 'text'} title="Recap" />)

    await user.click(screen.getByRole('button', { name: 'Share' }))
    expect(screen.getByRole('button', { name: 'Share as text' })).toBeInTheDocument()

    await user.click(document.body)
    expect(screen.queryByRole('button', { name: 'Share as text' })).not.toBeInTheDocument()
  })
})
