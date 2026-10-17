import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, within } from '@testing-library/react'
import { PrintableBillRecap } from './PrintableRecap'
import { CurrencyProvider } from '../context/CurrencyContext'

const members = [{ id: 'm1', name: 'Ana' }]
const categories = [
  { id: 'food', name: 'Groceries' },
  { id: 'home', name: 'Household' },
]
const item = (id, name, total_price, category_id = null) => ({ id, name, quantity: 1, total_price, category_id, item_shares: [] })

let printRoot
beforeEach(() => {
  printRoot = document.createElement('div')
  printRoot.id = 'print-root'
  document.body.appendChild(printRoot)
})
afterEach(() => printRoot.remove())

function renderRecap(bill, items) {
  render(
    <CurrencyProvider>
      <PrintableBillRecap bill={bill} items={items} members={members} categories={categories} />
    </CurrencyProvider>
  )
  return within(printRoot)
}

describe('PrintableBillRecap — categories', () => {
  it('prints a "By category" table when the bill spans several', () => {
    const recap = renderRecap({ title: 'Shop', category_id: 'food' }, [item('a', 'Milk', 2), item('b', 'Soap', 4.5, 'home')])
    expect(recap.getByRole('heading', { name: 'By category' })).toBeInTheDocument()
    const rows = recap.getAllByRole('table')[1].querySelectorAll('tr')
    expect([...rows].map((r) => r.cells[0].textContent)).toEqual(['Groceries', 'Household'])
  })

  it('prints one line for a single category, and no table', () => {
    const recap = renderRecap({ title: 'Shop', category_id: 'food' }, [item('a', 'Milk', 2)])
    expect(recap.getByText('Category: Groceries')).toBeInTheDocument()
    expect(recap.queryByRole('heading', { name: 'By category' })).not.toBeInTheDocument()
  })

  it('prints neither when nothing has a category', () => {
    const recap = renderRecap({ title: 'Shop' }, [item('a', 'Milk', 2)])
    expect(recap.queryByText(/Category/)).not.toBeInTheDocument()
  })
})
