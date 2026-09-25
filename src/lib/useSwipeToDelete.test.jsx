import { describe, expect, it, vi } from 'vitest'
import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import { useSwipeToDelete } from './useSwipeToDelete'

// Two rows wired exactly the way ItemRow/GroupView/History wire theirs: a
// delete strip plus a sliding foreground with its own click handler.
function Harness({ onRowClick, onDelete, renders }) {
  const { bind } = useSwipeToDelete()
  renders.count++
  return ['a', 'b'].map((id) => {
    const swipe = bind(id, () => onDelete(id))
    return (
      <div key={id}>
        <button type="button" {...swipe.deleteButton}>
          Remove {id}
        </button>
        <button type="button" data-testid={`row-${id}`} data-open={swipe.isOpen} onClick={() => onRowClick(id)} {...swipe.row}>
          Row {id}
        </button>
      </div>
    )
  })
}

function setup() {
  const onRowClick = vi.fn()
  const onDelete = vi.fn()
  const renders = { count: 0 }
  render(<Harness onRowClick={onRowClick} onDelete={onDelete} renders={renders} />)
  return { onRowClick, onDelete, renders, row: (id) => screen.getByTestId(`row-${id}`) }
}

// Pointer events with a controlled timeStamp (fireEvent can't set it), so
// drag speed is deterministic.
function pointer(el, type, { x = 0, y = 0, t = 0, pointerType = 'touch' } = {}) {
  const event = createEvent[type](el, { clientX: x, clientY: y, pointerType, pointerId: 1, button: 0 })
  Object.defineProperty(event, 'timeStamp', { value: t })
  fireEvent(el, event)
}

// A drag through [x, t] points (y stays 0), then release.
function drag(el, points, { pointerType = 'touch', end = 'pointerUp' } = {}) {
  const [[x0, t0], ...rest] = points
  pointer(el, 'pointerDown', { x: x0, t: t0, pointerType })
  for (const [x, t] of rest) pointer(el, 'pointerMove', { x, t, pointerType })
  const [xEnd, tEnd] = points[points.length - 1]
  pointer(el, end, { x: xEnd, t: tEnd, pointerType })
}

// A slow, deliberate drag from 200px to `toX`, ending with the finger still.
function slowDrag(el, toX, opts) {
  const points = [[200, 0]]
  for (let x = 200, t = 0; x > toX; ) {
    x = Math.max(toX, x - 5)
    t += 50
    points.push([x, t])
  }
  points.push([toX, points[points.length - 1][1] + 200])
  drag(el, points, opts)
}

function tap(el, { pointerType = 'touch' } = {}) {
  pointer(el, 'pointerDown', { x: 100, pointerType })
  pointer(el, 'pointerUp', { x: 100, pointerType })
  fireEvent.click(el)
}

describe('useSwipeToDelete — following the finger', () => {
  it('moves the row with the finger without re-rendering the list on every move', () => {
    const { row, renders } = setup()
    const before = renders.count

    pointer(row('a'), 'pointerDown', { x: 200, t: 0 })
    pointer(row('a'), 'pointerMove', { x: 180, t: 16 })
    expect(row('a').style.transform).toBe('translateX(-20px)')
    expect(row('a').style.transition).toBe('none')
    pointer(row('a'), 'pointerMove', { x: 150, t: 32 })
    pointer(row('a'), 'pointerMove', { x: 170, t: 48 })

    expect(row('a').style.transform).toBe('translateX(-30px)')
    expect(renders.count).toBe(before)
  })

  it('never slides further than the delete strip, or to the right', () => {
    const { row } = setup()
    pointer(row('a'), 'pointerDown', { x: 200, t: 0 })
    pointer(row('a'), 'pointerMove', { x: 20, t: 16 })
    expect(row('a').style.transform).toBe('translateX(-76px)')
    pointer(row('a'), 'pointerMove', { x: 300, t: 32 })
    expect(row('a').style.transform).toBe('translateX(0px)')
  })

  it('leaves a mostly vertical movement to page scrolling', () => {
    const { row } = setup()
    pointer(row('a'), 'pointerDown', { x: 200, y: 0, t: 0 })
    pointer(row('a'), 'pointerMove', { x: 194, y: 20, t: 16 })
    pointer(row('a'), 'pointerMove', { x: 100, y: 22, t: 32 })
    expect(row('a').style.transform).toBe('translateX(0px)')
  })
})

describe('useSwipeToDelete — settling on release', () => {
  it('opens when dragged past halfway', () => {
    const { row } = setup()
    slowDrag(row('a'), 150) // 50px of 76
    expect(row('a').dataset.open).toBe('true')
    expect(row('a').style.transform).toBe('translateX(-76px)')
    expect(row('a').style.transition).not.toBe('none')
  })

  it('snaps back, all the way, when released short of halfway', () => {
    const { row } = setup()
    slowDrag(row('a'), 170) // 30px
    expect(row('a').dataset.open).toBe('false')
    // Rendered state is unchanged (closed before, closed after), so React
    // won't touch the style — the hook itself has to put the row back.
    expect(row('a').style.transform).toBe('translateX(0px)')
  })

  it('opens on a quick flick even if it ends short of halfway', () => {
    const { row } = setup()
    drag(row('a'), [
      [200, 0],
      [190, 10],
      [175, 20],
    ])
    expect(row('a').dataset.open).toBe('true')
  })

  it('closes an open row on a quick flick back', () => {
    const { row } = setup()
    slowDrag(row('a'), 100)
    expect(row('a').dataset.open).toBe('true')
    drag(row('a'), [
      [100, 1000],
      [110, 1010],
      [125, 1020],
    ])
    expect(row('a').dataset.open).toBe('false')
    expect(row('a').style.transform).toBe('translateX(0px)')
  })

  it("settles by position when the browser takes the gesture over", () => {
    const { row } = setup()
    slowDrag(row('a'), 140, { end: 'pointerCancel' })
    expect(row('a').dataset.open).toBe('true')
    slowDrag(row('b'), 180, { end: 'pointerCancel' })
    expect(row('b').dataset.open).toBe('false')
    expect(row('b').style.transform).toBe('translateX(0px)')
  })
})

describe('useSwipeToDelete — taps after a swipe', () => {
  it('does not swallow the next tap after a touch swipe (which never ends in a click)', () => {
    const { row, onRowClick } = setup()
    slowDrag(row('a'), 100) // opens a; touch drags produce no click event
    tap(row('b'))
    expect(onRowClick).toHaveBeenCalledWith('b')
  })

  it('swallows the click a mouse drag ends with', () => {
    const { row, onRowClick } = setup()
    slowDrag(row('a'), 170, { pointerType: 'mouse' })
    fireEvent.click(row('a'))
    expect(onRowClick).not.toHaveBeenCalled()
    tap(row('a'), { pointerType: 'mouse' })
    expect(onRowClick).toHaveBeenCalledWith('a')
  })

  it('closes an open row when it is tapped, without also activating it', () => {
    const { row, onRowClick } = setup()
    slowDrag(row('a'), 100)
    tap(row('a'))
    expect(row('a').dataset.open).toBe('false')
    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('closes an open row when another row is touched', () => {
    const { row, onRowClick } = setup()
    slowDrag(row('a'), 100)
    tap(row('b'))
    expect(row('a').dataset.open).toBe('false')
    expect(onRowClick).toHaveBeenCalledWith('b')
  })

  it('deletes on the first tap of the revealed button', () => {
    const { row, onDelete } = setup()
    slowDrag(row('a'), 100)
    fireEvent.click(screen.getByRole('button', { name: 'Remove a' }))
    expect(onDelete).toHaveBeenCalledWith('a')
    expect(row('a').dataset.open).toBe('false')
  })
})
