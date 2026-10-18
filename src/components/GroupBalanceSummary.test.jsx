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

function renderSummary(settlement) {
  return render(
    <MemoryRouter>
      <CurrencyProvider>
        <GroupBalanceSummary
          groupId="g1"
          settlement={settlement}
          members={MEMBERS}
          myParticipantId="me"
          highlightFullBalanceLine
        />
      </CurrencyProvider>
    </MemoryRouter>
  )
}

const netLine = () => screen.getByText(/Net balance/)

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
      { from: 'b', to: 'c', amount: 100 },
    ])
    expect(netLine()).toHaveTextContent('3.00')
  })

  it('shows no net line when you are settled up', () => {
    renderSummary([{ from: 'b', to: 'c', amount: 100 }])
    expect(screen.queryByText(/Net balance/)).not.toBeInTheDocument()
    expect(screen.getByText(/all settled up/)).toBeInTheDocument()
  })
})
