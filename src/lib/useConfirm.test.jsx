import { describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useConfirm } from './useConfirm'
import ConfirmSheet from '../components/ConfirmSheet'

// Wired the way every caller wires it: ask, then render the sheet.
function Harness({ answers }) {
  const { confirm, sheetProps } = useConfirm()
  async function ask(label) {
    answers.push([label, await confirm({ title: `${label}?`, body: 'Sure?', confirmLabel: label })])
  }
  return (
    <>
      <button type="button" onClick={() => ask('Delete')}>Ask delete</button>
      <button type="button" onClick={() => ask('Remove')}>Ask remove</button>
      {sheetProps && <ConfirmSheet {...sheetProps} />}
    </>
  )
}

function setup() {
  const answers = []
  render(<Harness answers={answers} />)
  return { answers, user: userEvent.setup({ delay: null }) }
}

describe('useConfirm', () => {
  it('resolves true when confirmed, and closes the sheet', async () => {
    const { answers, user } = setup()
    await user.click(screen.getByText('Ask delete'))
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Delete?')
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(answers).toEqual([['Delete', true]])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('resolves false on Cancel, Escape or a backdrop tap', async () => {
    const { answers, user } = setup()
    await user.click(screen.getByText('Ask delete'))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByText('Ask delete'))
    await user.keyboard('{Escape}')
    await user.click(screen.getByText('Ask delete'))
    await user.click(document.querySelector('.sheet-backdrop'))
    expect(answers).toEqual([
      ['Delete', false],
      ['Delete', false],
      ['Delete', false],
    ])
  })

  it('answers an earlier question "no" when a new one replaces it', async () => {
    const { answers } = setup()
    // Both asked before the sheet could be answered (the second from code,
    // as a page might when one action leads straight into another).
    act(() => {
      screen.getByText('Ask delete').click()
      screen.getByText('Ask remove').click()
    })
    await act(async () => {})
    expect(answers).toEqual([['Delete', false]])
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Remove?')
  })
})
