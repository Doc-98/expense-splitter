import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GroupGuestsSection from './GroupGuestsSection'
import { groupRosterCache } from '../lib/groupRosterCache'

// Choosing a guest's avatar from their row: the circle and the ⋮ menu both
// open the picker, which leaves out avatars someone else already has.
const { mockFetchGroupRosterData, mockSetMemberAvatar } = vi.hoisted(() => ({
  mockFetchGroupRosterData: vi.fn(),
  mockSetMemberAvatar: vi.fn(),
}))

vi.mock('../lib/prefetchGroupSettings', () => ({ fetchGroupRosterData: mockFetchGroupRosterData }))
vi.mock('../lib/members', () => ({
  setMemberAvatar: mockSetMemberAvatar,
  addGuest: vi.fn(),
  setGuestActive: vi.fn(),
  renameGuest: vi.fn(),
  requestClaimLink: vi.fn(() => new Promise(() => {})),
  deleteGuestPermanently: vi.fn(),
}))
vi.mock('react-router-dom', () => ({
  useParams: () => ({ groupId: 'group-1' }),
  useSearchParams: () => [new URLSearchParams()],
}))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-me' } }) }))

const roster = () => ({
  name: 'Food split',
  adminId: 'member-other',
  inviteCode: 'abc',
  members: [
    { id: 'member-me', userId: 'user-me', name: 'Vincenzo', isGuest: false, active: true, avatarIcon: 'cat' },
    { id: 'member-other', userId: 'user-x', name: 'Bruno', isGuest: false, active: true, avatarIcon: null },
    { id: 'g1', userId: null, name: 'Anna', isGuest: true, active: true, avatarIcon: null, groupAvatarIcon: null },
    { id: 'g2', userId: null, name: 'Andrea', isGuest: true, active: true, avatarIcon: null, groupAvatarIcon: null },
  ],
})

beforeEach(() => {
  groupRosterCache.clear()
  mockFetchGroupRosterData.mockReset().mockResolvedValue(roster())
  mockSetMemberAvatar.mockReset().mockResolvedValue(undefined)
})

describe("GroupGuestsSection — a guest's avatar", () => {
  it('opens from the circle, leaves out taken avatars, and saves the pick', async () => {
    const user = userEvent.setup({ delay: null })
    render(<GroupGuestsSection />)

    await user.click(await screen.findByRole('button', { name: "Choose Anna's avatar" }))
    const annaRow = within(screen.getByRole('button', { name: "Choose Anna's avatar" }).closest('li'))
    expect(annaRow.queryByRole('button', { name: 'Cat' })).not.toBeInTheDocument() // Vincenzo's
    await user.click(annaRow.getByRole('button', { name: 'Duck' }))

    expect(mockSetMemberAvatar).toHaveBeenCalledWith('g1', 'duck', { asAdmin: false })
    expect(groupRosterCache.get('group-1').members.find((m) => m.id === 'g1').avatarIcon).toBe('duck')
  })

  it('opens from the ⋮ menu too', async () => {
    const user = userEvent.setup({ delay: null })
    render(<GroupGuestsSection />)

    await user.click(await screen.findByRole('button', { name: 'Actions for Andrea' }))
    await user.click(screen.getByRole('button', { name: 'Choose avatar' }))
    expect(screen.getByRole('button', { name: "Choose Andrea's avatar" })).toHaveAttribute('aria-expanded', 'true')
  })
})
