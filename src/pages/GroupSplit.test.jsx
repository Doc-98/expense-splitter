import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, Link, useParams } from 'react-router-dom'
import GroupSplit from './GroupSplit'

// Stand-ins for the two real pages: each shows the route params it sees
// (GroupView reads groupId from inside the layout route, so this also
// checks the params reach it there) and the props GroupSplit hands over.
vi.mock('./GroupView', () => ({
  default: function GroupViewStub({ activeBillId = null, printable = true }) {
    const { groupId } = useParams()
    return (
      <div data-testid="group">
        group {groupId} · open {String(activeBillId)} · {printable ? 'prints' : 'no print'}
        <Link to="/groups/g1/bills/b2">open b2</Link>
      </div>
    )
  },
}))

function BillStub() {
  const { groupId, billId } = useParams()
  return (
    <div data-testid="bill">
      bill {billId} of {groupId}
    </div>
  )
}

function setWide(wide) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: wide && query === '(min-width: 1024px)',
    addEventListener() {},
    removeEventListener() {},
  }))
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<GroupSplit />}>
          <Route path="/groups/:groupId" element={null} />
          <Route path="/groups/:groupId/bills/:billId" element={<BillStub />} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

afterEach(() => {
  delete window.matchMedia
})

describe('GroupSplit on a phone', () => {
  it('shows only the group page on the group route', () => {
    setWide(false)
    renderAt('/groups/g1')
    expect(screen.getByTestId('group')).toHaveTextContent('group g1 · open null · prints')
    expect(screen.queryByTestId('bill')).not.toBeInTheDocument()
  })

  it('shows only the bill on a bill route', () => {
    setWide(false)
    renderAt('/groups/g1/bills/b1')
    expect(screen.getByTestId('bill')).toHaveTextContent('bill b1 of g1')
    expect(screen.queryByTestId('group')).not.toBeInTheDocument()
  })

  it('falls back to the phone layout where matchMedia is missing', () => {
    renderAt('/groups/g1/bills/b1')
    expect(screen.queryByTestId('group')).not.toBeInTheDocument()
  })
})

describe('GroupSplit on a wide screen', () => {
  it('shows the list with an empty bill pane when no bill is open', () => {
    setWide(true)
    renderAt('/groups/g1')
    expect(screen.getByTestId('group')).toHaveTextContent('group g1 · open null · prints')
    expect(screen.getByText('No bill open')).toBeInTheDocument()
  })

  it('shows the list and the open bill side by side, leaving printing to the bill', () => {
    setWide(true)
    renderAt('/groups/g1/bills/b1')
    expect(screen.getByTestId('group')).toHaveTextContent('group g1 · open b1 · no print')
    expect(screen.getByTestId('bill')).toHaveTextContent('bill b1 of g1')
  })

  it('keeps the same group page mounted when another bill is opened', async () => {
    setWide(true)
    const user = userEvent.setup({ delay: null })
    renderAt('/groups/g1/bills/b1')
    const group = screen.getByTestId('group')
    await user.click(screen.getByText('open b2'))
    expect(screen.getByTestId('bill')).toHaveTextContent('bill b2 of g1')
    expect(screen.getByTestId('group')).toBe(group)
    expect(group).toHaveTextContent('open b2')
  })
})
