import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConfirmSheet from './ConfirmSheet'

function renderSheet(props) {
  return render(
    <ConfirmSheet title="Leave Beach Trip?" body="You'll lose access to its bills." confirmLabel="Leave" onConfirm={vi.fn()} onCancel={vi.fn()} {...props} />
  )
}

describe('ConfirmSheet', () => {
  it('renders the title, body, and confirm label as a dialog', () => {
    renderSheet()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAccessibleName('Leave Beach Trip?')
    expect(screen.getByText("You'll lose access to its bills.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument()
  })

  it('calls onConfirm when the confirm button is clicked', async () => {
    const user = userEvent.setup({ delay: null })
    const onConfirm = vi.fn()
    renderSheet({ onConfirm })
    await user.click(screen.getByRole('button', { name: 'Leave' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('calls onCancel when the Cancel button is clicked', async () => {
    const user = userEvent.setup({ delay: null })
    const onCancel = vi.fn()
    renderSheet({ onCancel })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('calls onCancel on a backdrop click, but not on a click inside the panel', async () => {
    const user = userEvent.setup({ delay: null })
    const onCancel = vi.fn()
    renderSheet({ onCancel })

    await user.click(screen.getByRole('dialog'))
    expect(onCancel).not.toHaveBeenCalled()

    await user.click(document.querySelector('.sheet-backdrop'))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('calls onCancel on Escape', async () => {
    const user = userEvent.setup({ delay: null })
    const onCancel = vi.fn()
    renderSheet({ onCancel })
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
