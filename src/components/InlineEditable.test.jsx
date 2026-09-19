import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import InlineEditable from './InlineEditable'

describe('InlineEditable', () => {
  it('shows the display value as a button, not yet editing', () => {
    render(<InlineEditable value="1.29" display="$1.29" onSave={vi.fn()} />)
    expect(screen.getByRole('button', { name: '$1.29' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('switches to an input, pre-filled with the raw value, on click', async () => {
    const user = userEvent.setup()
    render(<InlineEditable value="1.29" display="$1.29" onSave={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '$1.29' }))

    const input = screen.getByRole('textbox')
    expect(input).toHaveValue('1.29')
  })

  it('commits a changed value on Enter and stops editing', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<InlineEditable value="1.29" display="$1.29" onSave={onSave} />)

    await user.click(screen.getByRole('button', { name: '$1.29' }))
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), '2.50')
    await user.keyboard('{Enter}')

    expect(onSave).toHaveBeenCalledWith('2.50')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('commits a changed value on blur too', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <>
        <InlineEditable value="1.29" display="$1.29" onSave={onSave} />
        <button type="button">elsewhere</button>
      </>
    )

    await user.click(screen.getByRole('button', { name: '$1.29' }))
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), '2.50')
    await user.click(screen.getByRole('button', { name: 'elsewhere' }))

    expect(onSave).toHaveBeenCalledWith('2.50')
  })

  it('reverts without saving on Escape', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<InlineEditable value="1.29" display="$1.29" onSave={onSave} />)

    await user.click(screen.getByRole('button', { name: '$1.29' }))
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), '2.50')
    await user.keyboard('{Escape}')

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '$1.29' })).toBeInTheDocument()
  })

  it('does not call onSave when the value is unchanged', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<InlineEditable value="1.29" display="$1.29" onSave={onSave} />)

    await user.click(screen.getByRole('button', { name: '$1.29' }))
    await user.keyboard('{Enter}')

    expect(onSave).not.toHaveBeenCalled()
  })

  it('reverts instead of saving when confirmed empty', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<InlineEditable value="1.29" display="$1.29" onSave={onSave} />)

    await user.click(screen.getByRole('button', { name: '$1.29' }))
    await user.clear(screen.getByRole('textbox'))
    await user.keyboard('{Enter}')

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '$1.29' })).toBeInTheDocument()
  })

  it('renders a textarea instead of an input when multiline', async () => {
    const user = userEvent.setup()
    render(<InlineEditable value="a note" display="a note" onSave={vi.fn()} multiline />)

    await user.click(screen.getByRole('button', { name: 'a note' }))

    expect(screen.getByRole('textbox').tagName).toBe('TEXTAREA')
  })
})
