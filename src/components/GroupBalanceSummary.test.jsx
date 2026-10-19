import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import GroupBalanceSummary from './GroupBalanceSummary'
import { CurrencyProvider } from '../context/CurrencyContext'

const MEMBERS = [
  { id: 'me', name: 'Me' },
  { id: 'a', name: 'Alice' },
  { id: 'b', name: 'Bob' },
  { id: 'c', name: 'Carol' },
]

function renderSummary(settlement, netBalanceStyle) {
  return render(
    <MemoryRouter>
      <CurrencyProvider>
        <GroupBalanceSummary
          groupId="g1"
          settlement={settlement}
          members={MEMBERS}
          myParticipantId="me"
          highlightFullBalanceLine
          netBalanceStyle={netBalanceStyle}
        />
      </CurrencyProvider>
    </MemoryRouter>
  )
}

const netLine = () => screen.getByText(/Net balance/).closest('p')

describe('GroupBalanceSummary net balance', () => {
  it('sums what you are owed from several people', () => {
    renderSummary([
      { from: 'a', to: 'me', amount: 10 },
      { from: 'b', to: 'me', amount: 4.5 },
    ])
    expect(netLine()).toHaveTextContent("you're owed")
    expect(netLine()).toHaveTextContent('14.50')
    expect(netLine()).toHaveClass('balance-positive')
  })

  it('subtracts what you owe from what you are owed', () => {
    renderSummary([
      { from: 'a', to: 'me', amount: 10 },
      { from: 'me', to: 'b', amount: 25 },
    ])
    expect(netLine()).toHaveTextContent('you owe')
    expect(netLine()).toHaveTextContent('15.00')
    expect(netLine()).toHaveClass('balance-negative')
  })

  it('says even when the lines cancel out', () => {
    renderSummary([
      { from: 'a', to: 'me', amount: 7 },
      { from: 'me', to: 'b', amount: 7 },
    ])
    expect(netLine()).toHaveTextContent("you're even overall")
  })

  it('ignores debts between other people', () => {
    renderSummary([
      { from: 'a', to: 'me', amount: 3 },
      { from: 'me', to: 'b', amount: 1 },
      { from: 'b', to: 'c', amount: 100 },
    ])
    expect(netLine()).toHaveTextContent('2.00')
  })

  it('shows no net line for a single debt, which would only repeat it', () => {
    renderSummary([{ from: 'a', to: 'me', amount: 19.9 }])
    expect(screen.queryByText(/Net balance/)).not.toBeInTheDocument()
    expect(screen.getByText(/owes You/)).toBeInTheDocument()
  })

  it('shows no net line when you are settled up', () => {
    renderSummary([{ from: 'b', to: 'c', amount: 100 }])
    expect(screen.queryByText(/Net balance/)).not.toBeInTheDocument()
    expect(screen.getByText(/all settled up/)).toBeInTheDocument()
  })

  it('puts "Net balance:" in bold above the debts by default', () => {
    renderSummary([
      { from: 'a', to: 'me', amount: 10 },
      { from: 'b', to: 'me', amount: 4.5 },
    ])
    expect(screen.getByText('Net balance:').tagName).toBe('STRONG')
    expect(netLine()).toBe(document.querySelector('.balance-summary').firstElementChild)
  })

  it('can show the total under a line after the debts, or as a small footnote, or not at all', () => {
    const lines = [
      { from: 'a', to: 'me', amount: 10 },
      { from: 'me', to: 'b', amount: 25 },
    ]
    const { unmount } = renderSummary(lines, 'total')
    const total = document.querySelector('.balance-net-total')
    expect(total).toHaveTextContent(/Net\s*you owe €15\.00/)
    expect(total).toBe(document.querySelector('.balance-summary').lastElementChild)
    unmount()

    const second = renderSummary(lines, 'note')
    expect(document.querySelector('.balance-net-note')).toHaveTextContent("Overall you owe €15.00")
    expect(document.querySelector('.balance-net-note .mono')).toHaveClass('balance-negative')
    second.unmount()

    renderSummary(lines, 'off')
    expect(screen.queryByText(/Net|Overall/)).not.toBeInTheDocument()
  })
})
