import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddItemForm from './AddItemForm'

function renderForm(onAdd = vi.fn().mockResolvedValue(true)) {
  const nameRef = createRef()
  render(<AddItemForm nameRef={nameRef} onAdd={onAdd} />)
  return { onAdd, nameRef }
}

describe('AddItemForm', () => {
  it('needs a name and a price before it can add', async () => {
    const user = userEvent.setup()
    renderForm()
    const add = screen.getByRole('button', { name: 'Add item' })
    expect(add).toBeDisabled()
    await user.type(screen.getByPlaceholderText('Item'), 'Milk')
    expect(add).toBeDisabled()
    await user.type(screen.getByPlaceholderText('Price'), '1,29')
    expect(add).toBeEnabled()
  })

  it('adds the item with the price worked out, then clears for the next one', async () => {
    const user = userEvent.setup()
    const { onAdd } = renderForm()
    await user.type(screen.getByPlaceholderText('Item'), '  Milk ')
    await user.type(screen.getByPlaceholderText('Price'), '2,30-1,25')
    await user.clear(screen.getByPlaceholderText('Qty'))
    await user.type(screen.getByPlaceholderText('Qty'), '2{Enter}')
    expect(onAdd).toHaveBeenCalledWith('Milk', 1.05, 2)
    expect(screen.getByPlaceholderText('Item')).toHaveValue('')
    expect(screen.getByPlaceholderText('Qty')).toHaveValue('1')
    expect(screen.getByPlaceholderText('Item')).toHaveFocus()
  })

  it("keeps what was typed when the item couldn't be added", async () => {
    const user = userEvent.setup()
    renderForm(vi.fn().mockResolvedValue(false))
    await user.type(screen.getByPlaceholderText('Item'), 'Milk')
    await user.type(screen.getByPlaceholderText('Price'), '1{Enter}')
    expect(screen.getByPlaceholderText('Item')).toHaveValue('Milk')
  })

  it('Tab cycles through the three fields only', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByPlaceholderText('Item'))
    await user.tab()
    expect(screen.getByPlaceholderText('Price')).toHaveFocus()
    await user.tab()
    expect(screen.getByPlaceholderText('Qty')).toHaveFocus()
    await user.tab()
    expect(screen.getByPlaceholderText('Item')).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByPlaceholderText('Qty')).toHaveFocus()
  })
})
