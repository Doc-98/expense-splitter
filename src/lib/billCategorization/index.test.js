// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { classifyEntries, classifyEntryKey, classifyTitles, CLASSIFY_BATCH_SIZE } from './index'

const { mockClassify } = vi.hoisted(() => ({ mockClassify: vi.fn() }))
vi.mock('../receiptSettings', () => ({ getReceiptSettings: () => ({ strategyId: 'claude' }) }))
vi.mock('./strategies/claudeText', () => ({
  claudeTextStrategy: { id: 'claude', label: 'Claude', isConfigured: () => true, classify: mockClassify },
}))
vi.mock('./strategies/geminiText', () => ({ geminiTextStrategy: { id: 'gemini', isConfigured: () => false } }))
vi.mock('./strategies/ollamaText', () => ({ ollamaTextStrategy: { id: 'ollama', isConfigured: () => false } }))

const entry = (title, bankCategory = null) => ({ title, details: null, bankCategory, bankCategoryMappedTo: null })

beforeEach(() => mockClassify.mockReset())

describe('classifyEntries', () => {
  it('asks once per distinct entry and answers by key, null meaning "looked, cannot tell"', async () => {
    mockClassify.mockResolvedValue(['Groceries', null])
    const coop = entry('Coop', 'Supermercati')
    const paypal = entry('Addebito PayPal', 'Utenze')
    const results = await classifyEntries([coop, paypal, { ...coop }], ['Groceries'])
    expect(mockClassify).toHaveBeenCalledTimes(1)
    expect(mockClassify.mock.calls[0][0]).toEqual([coop, paypal])
    expect(results.get(classifyEntryKey(coop))).toBe('Groceries')
    expect(results.get(classifyEntryKey(paypal))).toBe(null)
  })

  it('leaves out the entries of a batch that failed, keeping the others', async () => {
    const many = Array.from({ length: CLASSIFY_BATCH_SIZE + 1 }, (_, i) => entry(`Shop ${i}`))
    mockClassify.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(['Groceries'])
    const progress = vi.fn()
    const results = await classifyEntries(many, ['Groceries'], progress)
    expect(results.size).toBe(1)
    expect(results.has(classifyEntryKey(many[0]))).toBe(false)
    expect(results.get(classifyEntryKey(many.at(-1)))).toBe('Groceries')
    expect(progress).toHaveBeenLastCalledWith(many.length, many.length)
  })
})

describe('classifyTitles', () => {
  it('still answers null for the titles of a failed batch', async () => {
    mockClassify.mockRejectedValueOnce(new Error('offline'))
    const results = await classifyTitles(['Coop'], ['Groceries'])
    expect(results.get('Coop')).toBe(null)
  })
})
