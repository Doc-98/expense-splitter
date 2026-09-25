import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MultiPayerModal, { validatePayerDraft } from './MultiPayerModal'
import { CurrencyProvider } from '../context/CurrencyContext'

// validatePayerDraft is a named export specifically so the one bit of real
// logic in this otherwise-plain form is testable without React at all
// (see the component file's own comment) — tested directly here rather
// than only indirectly through the rendered form below.
describe('validatePayerDraft', () => {
  it('is invalid when no one is selected, even with an empty draft summing to 0', () => {
    const result = validatePayerDraft({}, 0)
    expect(result.hasAnyPayer).toBe(false)
    expect(result.isValid).toBe(false)
  })

  it('is invalid when the entered amounts fall short of the bill total', () => {
    const result = validatePayerDraft({ 'member-1': '5.00', 'member-2': '3.00' }, 10)
    expect(result.roundedEntered).toBe(8)
    expect(result.sumsMatch).toBe(false)
    expect(result.isValid).toBe(false)
  })

  it('is valid once the entered amounts sum exactly to the bill total', () => {
    const result = validatePayerDraft({ 'member-1': '6.00', 'member-2': '4.00' }, 10)
    expect(result.sumsMatch).toBe(true)
    expect(result.isValid).toBe(true)
  })

  it('tolerates a sub-cent floating-point gap', () => {
    // 0.1 + 0.2 is the classic binary-float case that doesn't land on
    // exactly 0.3 — real money math in this app always rounds to the
    // cent rather than tripping over that.
    const result = validatePayerDraft({ 'member-1': '0.1', 'member-2': '0.2' }, 0.3)
    expect(result.isValid).toBe(true)
  })

  it('treats an unparseable amount as 0 rather than throwing', () => {
    const result = validatePayerDraft({ 'member-1': 'abc', 'member-2': '10.00' }, 10)
    expect(result.roundedEntered).toBe(10)
    expect(result.isValid).toBe(true)
  })
})

const MEMBERS = [
  { id: 'member-alice', name: 'Alice' },
  { id: 'member-bob', name: 'Bob' },
  { id: 'member-carol', name: 'Carol' },
]

function renderModal(props) {
  return render(
    <CurrencyProvider>
      <MultiPayerModal
        members={MEMBERS}
        billTotal={10}
        currentPayers={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        {...props}
      />
    </CurrencyProvider>
  )
}

describe('MultiPayerModal', () => {
  it('uses the default title when none is given, or a custom one when provided', () => {
    const { rerender } = renderModal()
    expect(screen.getByRole('heading', { name: 'Multiple payers' })).toBeInTheDocument()

    rerender(
      <CurrencyProvider>
        <MultiPayerModal
          title="Split unevenly"
          members={MEMBERS}
          billTotal={10}
          currentPayers={[]}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      </CurrencyProvider>
    )
    expect(screen.getByRole('heading', { name: 'Split unevenly' })).toBeInTheDocument()
  })

  it('seeds the draft from currentPayers: checked and pre-filled', () => {
    renderModal({ currentPayers: [{ member_id: 'member-alice', amount: 6 }] })

    expect(screen.getByRole('checkbox', { name: 'Alice' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Bob' })).not.toBeChecked()
    expect(screen.getByLabelText("Alice's amount")).toHaveValue('6')
  })

  it("enables a person's amount field only once they're checked", async () => {
    const user = userEvent.setup({ delay: null })
    renderModal()

    const aliceAmount = screen.getByLabelText("Alice's amount")
    expect(aliceAmount).toBeDisabled()

    await user.click(screen.getByRole('checkbox', { name: 'Alice' }))
    expect(aliceAmount).not.toBeDisabled()

    await user.click(screen.getByRole('checkbox', { name: 'Alice' }))
    expect(aliceAmount).toBeDisabled()
  })

  it('shows "select at least one person" until someone is checked', async () => {
    const user = userEvent.setup({ delay: null })
    renderModal()
    expect(screen.getByText('Select at least one person.')).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Alice' }))
    expect(screen.queryByText('Select at least one person.')).not.toBeInTheDocument()
  })

  it("flags a mismatch until the entered amounts add up to the bill total", async () => {
    const user = userEvent.setup({ delay: null })
    renderModal({ billTotal: 10 })

    await user.click(screen.getByRole('checkbox', { name: 'Alice' }))
    await user.type(screen.getByLabelText("Alice's amount"), '4')
    expect(screen.getByText('These amounts need to add up to exactly the bill total.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()

    await user.click(screen.getByRole('checkbox', { name: 'Bob' }))
    await user.type(screen.getByLabelText("Bob's amount"), '6')
    expect(screen.queryByText('These amounts need to add up to exactly the bill total.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).not.toBeDisabled()
  })

  it('confirms with the parsed amounts for exactly the checked members', async () => {
    const user = userEvent.setup({ delay: null })
    const onConfirm = vi.fn()
    renderModal({ billTotal: 10, onConfirm })

    await user.click(screen.getByRole('checkbox', { name: 'Alice' }))
    await user.type(screen.getByLabelText("Alice's amount"), '6')
    await user.click(screen.getByRole('checkbox', { name: 'Bob' }))
    await user.type(screen.getByLabelText("Bob's amount"), '4')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(onConfirm).toHaveBeenCalledWith([
      { member_id: 'member-alice', amount: 6 },
      { member_id: 'member-bob', amount: 4 },
    ])
  })

  it('cancels via the Cancel button', async () => {
    const user = userEvent.setup({ delay: null })
    const onCancel = vi.fn()
    renderModal({ onCancel })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('cancels on a backdrop click, but not on a click inside the panel', async () => {
    const user = userEvent.setup({ delay: null })
    const onCancel = vi.fn()
    const { container } = renderModal({ onCancel })

    await user.click(screen.getByRole('heading', { name: 'Multiple payers' }))
    expect(onCancel).not.toHaveBeenCalled()

    await user.click(container.querySelector('.modal-backdrop'))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
