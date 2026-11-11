import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import GroupAvatarClashNotice from './GroupAvatarClashNotice'

vi.mock('../lib/prefetchGroupSettings', () => ({ prefetchGroupSettings: () => {} }))

const person = (id, name, extra = {}) => ({ id, name, avatarIcon: null, active: true, isGuest: false, ...extra })

function renderNotice(members, { myParticipantId = 'me', isAdmin = false } = {}) {
  return render(
    <MemoryRouter>
      <GroupAvatarClashNotice groupId="g1" members={members} myParticipantId={myParticipantId} isAdmin={isAdmin} />
    </MemoryRouter>
  )
}

beforeEach(() => localStorage.clear())

describe('GroupAvatarClashNotice', () => {
  it('points out two guests who look the same, and links to their row in Guests', () => {
    renderNotice([
      person('me', 'Vincenzo', { avatarIcon: 'cat' }),
      person('g1', 'Anna', { isGuest: true }),
      person('g2', 'andrea', { isGuest: true }),
    ])
    expect(screen.getByRole('status')).toHaveTextContent('Anna and andrea look the same on bills.')
    expect(screen.getByRole('link', { name: 'Pick avatars' })).toHaveAttribute(
      'href',
      '/groups/g1/settings?section=guests&avatar=g1'
    )
  })

  it('puts you first, and sends you to your own avatar', () => {
    renderNotice([person('x', 'Bruno', { avatarIcon: 'duck' }), person('me', 'Vincenzo', { avatarIcon: 'duck' })])
    expect(screen.getByRole('status')).toHaveTextContent('You and Bruno look the same on bills.')
    expect(screen.getByRole('link', { name: 'Pick avatars' })).toHaveAttribute(
      'href',
      '/groups/g1/settings?section=members&avatar=me'
    )
  })

  it("stays out of the way of a clash between two other members, unless you're the admin", () => {
    const members = [person('me', 'Vincenzo'), person('x', 'Anna'), person('y', 'Andrea')]
    const { unmount } = renderNotice(members)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    unmount()
    renderNotice(members, { isAdmin: true })
    expect(screen.getByRole('link', { name: 'Pick avatars' })).toHaveAttribute(
      'href',
      '/groups/g1/settings?section=members&avatar=x'
    )
  })

  it('hides a clash for good once dismissed, but shows a new one', async () => {
    const user = userEvent.setup()
    const members = [
      person('me', 'Vincenzo'),
      person('g1', 'Anna', { isGuest: true }),
      person('g2', 'Andrea', { isGuest: true }),
    ]
    const { unmount } = renderNotice(members)
    await user.click(screen.getByRole('button', { name: 'Hide this' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    unmount()

    renderNotice(members)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    renderNotice([...members, person('g3', 'Alba', { isGuest: true })])
    expect(screen.getByRole('status')).toHaveTextContent('Anna, Andrea and Alba look the same on bills.')
  })
})
