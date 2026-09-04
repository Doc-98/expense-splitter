import { describe, it, expect, beforeEach } from 'vitest'
import { getBankCategoryMappings, saveBankCategoryMappings } from './bankCategoryMappings'

// Runs under vitest's jsdom environment (see vitest.config.js) so
// `localStorage` is real, not stubbed — cleared between tests since this
// module's whole point is persisting across calls, which would otherwise
// leak state from one test into the next.
beforeEach(() => {
  localStorage.clear()
})

describe('bankCategoryMappings', () => {
  it('returns an empty object for a group with no mappings yet', () => {
    expect(getBankCategoryMappings('group-a')).toEqual({})
  })

  it('saves and reads back a mapping, including an explicit null', () => {
    saveBankCategoryMappings('group-a', { alimentazione: 'cat-groceries', bollette: null })
    const mappings = getBankCategoryMappings('group-a')
    expect(mappings.alimentazione).toBe('cat-groceries')
    expect('bollette' in mappings).toBe(true)
    expect(mappings.bollette).toBeNull()
  })

  it('keeps each group independent', () => {
    saveBankCategoryMappings('group-a', { groceries: 'cat-1' })
    expect(getBankCategoryMappings('group-b')).toEqual({})
  })

  it('merges a later save into the existing group mapping rather than replacing it', () => {
    saveBankCategoryMappings('group-a', { groceries: 'cat-1' })
    saveBankCategoryMappings('group-a', { transport: 'cat-2' })
    expect(getBankCategoryMappings('group-a')).toEqual({ groceries: 'cat-1', transport: 'cat-2' })
  })

  it('a later save can overwrite an earlier mapping for the same hint', () => {
    saveBankCategoryMappings('group-a', { groceries: 'cat-1' })
    saveBankCategoryMappings('group-a', { groceries: 'cat-2' })
    expect(getBankCategoryMappings('group-a').groceries).toBe('cat-2')
  })
})
