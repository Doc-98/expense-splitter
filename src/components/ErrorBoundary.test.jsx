import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'

function Boom({ message }) {
  throw new Error(message)
}

beforeEach(() => {
  // React logs caught render errors itself; keep the test output clean.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('ErrorBoundary', () => {
  it('renders its children normally', () => {
    render(
      <ErrorBoundary resetKey="/">
        <p>All good</p>
      </ErrorBoundary>
    )
    expect(screen.getByText('All good')).toBeInTheDocument()
  })

  it('replaces a crashed page with a way out, instead of a blank app', () => {
    render(
      <ErrorBoundary resetKey="/">
        <Boom message="Cannot read properties of undefined" />
      </ErrorBoundary>
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.getByText(/unexpected error/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to my groups' })).toHaveAttribute('href', '/')
    expect(console.error).toHaveBeenCalledWith('Page crashed:', expect.any(Error), expect.anything())
  })

  it('explains a page file that failed to load as an app update', () => {
    render(
      <ErrorBoundary resetKey="/">
        <Boom message="Failed to fetch dynamically imported module: /assets/GroupGraphs-abc.js" />
      </ErrorBoundary>
    )
    expect(screen.getByText(/the app was probably just updated/)).toBeInTheDocument()
  })

  it('recovers on navigation', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/groups/1/stats">
        <Boom message="bug" />
      </ErrorBoundary>
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()

    rerender(
      <ErrorBoundary resetKey="/groups/1">
        <p>Group page</p>
      </ErrorBoundary>
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Group page')).toBeInTheDocument()
  })
})
