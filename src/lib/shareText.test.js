import { afterEach, describe, expect, it, vi } from 'vitest'
import { shareOrCopyText } from './shareText'

// navigator.share/navigator.clipboard don't exist on jsdom's navigator by
// default — defined here per test via Object.defineProperty (configurable,
// so afterEach can delete it again) rather than a plain assignment, which
// jsdom's read-only navigator getters silently reject.
function stubShare(impl) {
  Object.defineProperty(navigator, 'share', { value: impl, configurable: true })
}
function stubClipboard(impl) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: impl }, configurable: true })
}

afterEach(() => {
  delete navigator.share
  delete navigator.clipboard
})

describe('shareOrCopyText', () => {
  it('shares via navigator.share when available, with the given title and text', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    stubShare(share)

    const result = await shareOrCopyText('Join Beach Trip', 'Invite')

    expect(share).toHaveBeenCalledWith({ title: 'Invite', text: 'Join Beach Trip' })
    expect(result).toBe('shared')
  })

  it('reports "cancelled", without touching the clipboard, when the share sheet is dismissed', async () => {
    const abortError = Object.assign(new Error('cancelled'), { name: 'AbortError' })
    stubShare(vi.fn().mockRejectedValue(abortError))
    const writeText = vi.fn()
    stubClipboard(writeText)

    const result = await shareOrCopyText('text', 'title')

    expect(result).toBe('cancelled')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('falls back to the clipboard when navigator.share itself fails for another reason', async () => {
    stubShare(vi.fn().mockRejectedValue(new Error('share failed')))
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)

    const result = await shareOrCopyText('text', 'title')

    expect(writeText).toHaveBeenCalledWith('text')
    expect(result).toBe('copied')
  })

  it('copies to the clipboard directly when navigator.share does not exist at all', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)

    const result = await shareOrCopyText('text', 'title')

    expect(writeText).toHaveBeenCalledWith('text')
    expect(result).toBe('copied')
  })
})
