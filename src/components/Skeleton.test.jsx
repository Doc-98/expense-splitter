import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { LoadingState, SkeletonRows } from './Skeleton'

afterEach(() => vi.useRealTimers())

describe('LoadingState', () => {
  it('announces its label at once but only draws the placeholder after a short delay', () => {
    vi.useFakeTimers()
    const { container } = render(
      <LoadingState label="Loading your groups…">
        <SkeletonRows count={2} />
      </LoadingState>,
    )
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Loading your groups…')
    expect(status).toHaveAttribute('aria-busy', 'true')
    // A fast load never flashes a placeholder…
    expect(container.querySelectorAll('.skeleton-row')).toHaveLength(0)
    // …a slow one gets one, hidden from assistive tech (the label says it).
    act(() => vi.advanceTimersByTime(300))
    expect(container.querySelectorAll('.skeleton-row')).toHaveLength(2)
    expect(container.querySelector('.skeleton-rows').parentElement).toHaveAttribute('aria-hidden', 'true')
  })
})
