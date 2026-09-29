import { describe, expect, it, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { useListKeyboardNav } from './useListKeyboardNav'

function List({ onOpen }) {
  const nav = useListKeyboardNav({ page: 0, setPage: () => {}, maxPage: 0, itemCount: 3, onOpen })
  return (
    <div>
      <span data-testid="state">{`${nav.active}:${nav.focusedIndex}`}</span>
      <button type="button">outside</button>
      <div data-own-keys>
        <button type="button">inside</button>
      </div>
    </div>
  )
}

describe('useListKeyboardNav', () => {
  it('moves and opens with the arrows and Enter', () => {
    const onOpen = vi.fn()
    const { getByTestId, getByText } = render(<List onOpen={onOpen} />)
    const outside = getByText('outside')
    fireEvent.keyDown(outside, { key: 'ArrowDown' })
    fireEvent.keyDown(outside, { key: 'ArrowDown' })
    expect(getByTestId('state')).toHaveTextContent('true:1')
    fireEvent.keyDown(outside, { key: 'Enter' })
    expect(onOpen).toHaveBeenCalledWith(1)
  })

  it('leaves keys pressed inside a data-own-keys region alone', () => {
    const onOpen = vi.fn()
    const { getByTestId, getByText } = render(<List onOpen={onOpen} />)
    fireEvent.keyDown(getByText('outside'), { key: 'ArrowDown' })
    const inside = getByText('inside')
    fireEvent.keyDown(inside, { key: 'ArrowDown' })
    expect(getByTestId('state')).toHaveTextContent('true:0')
    fireEvent.keyDown(inside, { key: 'Enter' })
    expect(onOpen).not.toHaveBeenCalled()
  })
})
