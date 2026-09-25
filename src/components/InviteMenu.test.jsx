import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import InviteMenu from './InviteMenu'

// The QR code is generated via a dynamic import('qrcode') (see the
// component's own comment — lazy, first-open-only) rather than a static
// one, but it mocks the same way: vi.mock() covers a module regardless of
// how it's later imported. The component calls `QRCode.toDataURL(...)`
// directly on the awaited namespace (no `.default`), so the mock factory
// returns `toDataURL` as a plain named export to match.
const { mockToDataURL } = vi.hoisted(() => ({ mockToDataURL: vi.fn() }))
vi.mock('qrcode', () => ({ toDataURL: mockToDataURL }))

function stubShare(impl) {
  Object.defineProperty(navigator, 'share', { value: impl, configurable: true })
}
function stubClipboard(impl) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: impl }, configurable: true })
}

function renderMenu(props) {
  return render(<InviteMenu inviteUrl="https://spesa.app/join/abc123" groupName="Beach Trip" {...props} />)
}

beforeEach(() => {
  mockToDataURL.mockReset().mockResolvedValue('data:image/png;base64,fakeqr')
})

afterEach(() => {
  delete navigator.share
  delete navigator.clipboard
})

describe('InviteMenu — opening', () => {
  it('stays closed until the Invite button is clicked', () => {
    renderMenu()
    expect(screen.queryByAltText('QR code to join this group')).not.toBeInTheDocument()
  })

  it('shows a generating placeholder while the QR code is not yet ready', async () => {
    const user = userEvent.setup({ delay: null })
    mockToDataURL.mockReturnValue(new Promise(() => {})) // never resolves this test
    renderMenu()

    await user.click(screen.getByRole('button', { name: 'Invite' }))
    expect(screen.getByText('Generating QR code…')).toBeInTheDocument()
  })

  it('shows the QR code once generation resolves', async () => {
    const user = userEvent.setup({ delay: null })
    renderMenu()

    await user.click(screen.getByRole('button', { name: 'Invite' }))
    const qr = await screen.findByAltText('QR code to join this group')
    expect(qr).toHaveAttribute('src', 'data:image/png;base64,fakeqr')
    expect(mockToDataURL).toHaveBeenCalledWith('https://spesa.app/join/abc123', { width: 220, margin: 1 })
  })

  it('generates the QR code only once — cached across close/reopen', async () => {
    const user = userEvent.setup({ delay: null })
    renderMenu()

    await user.click(screen.getByRole('button', { name: 'Invite' }))
    await screen.findByAltText('QR code to join this group')
    await user.click(screen.getByRole('button', { name: 'Invite' })) // close
    await user.click(screen.getByRole('button', { name: 'Invite' })) // reopen

    expect(screen.getByAltText('QR code to join this group')).toBeInTheDocument() // still there immediately, no "Generating…" flash
    expect(mockToDataURL).toHaveBeenCalledOnce()
  })

  it('closes on an outside click', async () => {
    const user = userEvent.setup({ delay: null })
    renderMenu()

    await user.click(screen.getByRole('button', { name: 'Invite' }))
    await screen.findByAltText('QR code to join this group')
    await user.click(document.body)

    expect(screen.queryByAltText('QR code to join this group')).not.toBeInTheDocument()
  })
})

describe('InviteMenu — sharing', () => {
  it('shares the invite link and message via navigator.share when available', async () => {
    const user = userEvent.setup({ delay: null })
    const share = vi.fn().mockResolvedValue(undefined)
    stubShare(share)
    renderMenu()

    await user.click(screen.getByRole('button', { name: 'Invite' }))
    await user.click(screen.getByRole('button', { name: 'Share invite link' }))

    expect(share).toHaveBeenCalledWith({ title: 'Join Beach Trip on Spesa', text: 'https://spesa.app/join/abc123' })
    expect(screen.queryByText('Copied to clipboard!')).not.toBeInTheDocument()
  })

  it('falls back to copying, with a status message, when navigator.share is unavailable', async () => {
    const user = userEvent.setup({ delay: null })
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    renderMenu()

    await user.click(screen.getByRole('button', { name: 'Invite' }))
    await user.click(screen.getByRole('button', { name: 'Share invite link' }))

    expect(writeText).toHaveBeenCalledWith('https://spesa.app/join/abc123')
    expect(await screen.findByText('Copied to clipboard!')).toBeInTheDocument()
  })

  it("says so when the link can't be shared or copied, instead of doing nothing", async () => {
    const user = userEvent.setup({ delay: null })
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')))
    renderMenu()

    await user.click(screen.getByRole('button', { name: 'Invite' }))
    await user.click(screen.getByRole('button', { name: 'Share invite link' }))

    expect(await screen.findByText(/Couldn't share or copy the link/)).toBeInTheDocument()
  })

  it('still opens, with the Share button, when the QR code fails to load', async () => {
    const user = userEvent.setup({ delay: null })
    mockToDataURL.mockRejectedValue(new Error('Failed to fetch dynamically imported module'))
    renderMenu()

    await user.click(screen.getByRole('button', { name: 'Invite' }))

    expect(await screen.findByText(/Couldn't load the QR code/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share invite link' })).toBeInTheDocument()
  })
})
