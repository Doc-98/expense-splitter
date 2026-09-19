import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BillActionsMenu from './BillActionsMenu'

function renderMenu(overrides = {}) {
  const props = {
    billTitle: 'Lidl - Tuesday',
    onRename: vi.fn(),
    onSelect: vi.fn(),
    onShare: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  }
  const utils = render(<BillActionsMenu {...props} />)
  return { ...utils, props }
}

describe('BillActionsMenu', () => {
  it('starts closed, with the trigger labeled by the bill title', () => {
    renderMenu()
    expect(screen.getByLabelText('Actions for Lidl - Tuesday')).toBeInTheDocument()
    expect(screen.queryByText('Rename')).not.toBeInTheDocument()
  })

  it('opens the popover with Rename, Select, Share, Delete in that order', async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByLabelText('Actions for Lidl - Tuesday'))

    const items = screen.getAllByRole('button').filter((b) => b.className.includes('dropdown-item'))
    expect(items.map((b) => b.textContent)).toEqual(['Rename', 'Select', 'Share', 'Delete'])
  })

  it('calls onRename and closes the menu', async () => {
    const user = userEvent.setup()
    const { props } = renderMenu()

    await user.click(screen.getByLabelText('Actions for Lidl - Tuesday'))
    await user.click(screen.getByText('Rename'))

    expect(props.onRename).toHaveBeenCalledOnce()
    expect(screen.queryByText('Rename')).not.toBeInTheDocument()
  })

  it('calls onDelete and closes the menu', async () => {
    const user = userEvent.setup()
    const { props } = renderMenu()

    await user.click(screen.getByLabelText('Actions for Lidl - Tuesday'))
    await user.click(screen.getByText('Delete'))

    expect(props.onDelete).toHaveBeenCalledOnce()
    expect(screen.queryByText('Delete')).not.toBeInTheDocument()
  })

  it('closes when clicking outside, without calling any action', async () => {
    const user = userEvent.setup()
    const { props } = renderMenu()

    await user.click(screen.getByLabelText('Actions for Lidl - Tuesday'))
    expect(screen.getByText('Select')).toBeInTheDocument()

    await user.click(document.body)

    expect(screen.queryByText('Select')).not.toBeInTheDocument()
    expect(props.onSelect).not.toHaveBeenCalled()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByLabelText('Actions for Lidl - Tuesday'))
    expect(screen.getByText('Share')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByText('Share')).not.toBeInTheDocument()
  })

  it('toggles closed when clicking the trigger again', async () => {
    const user = userEvent.setup()
    renderMenu()

    const trigger = screen.getByLabelText('Actions for Lidl - Tuesday')
    await user.click(trigger)
    expect(screen.getByText('Select')).toBeInTheDocument()

    await user.click(trigger)
    expect(screen.queryByText('Select')).not.toBeInTheDocument()
  })
})
