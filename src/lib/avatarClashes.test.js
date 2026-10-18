// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { avatarClashes, takenAvatarIcons, clashFixSection, clashSignature } from './avatarClashes'

const person = (id, name, avatarIcon = null, extra = {}) => ({
  id,
  name,
  avatarIcon,
  active: true,
  isGuest: false,
  ...extra,
})

describe('avatarClashes', () => {
  it('finds people with the same icon, or no icon and the same initial', () => {
    const members = [
      person('me', 'Vincenzo', 'cat'),
      person('anna', 'Anna', null, { isGuest: true }),
      person('andrea', 'andrea', null, { isGuest: true }),
      person('bruno', 'Bruno', 'cat'),
      person('carla', 'Carla', 'duck'),
      person('alice', 'Alice', 'bee'), // starts with A, but has an icon
    ]
    expect(avatarClashes(members).map((c) => c.members.map((m) => m.id))).toEqual([
      ['me', 'bruno'],
      ['anna', 'andrea'],
    ])
  })

  it('ignores people who are no longer in the group', () => {
    expect(avatarClashes([person('a', 'Anna'), person('b', 'Andrea', null, { active: false })])).toEqual([])
  })
})

describe('takenAvatarIcons', () => {
  it("lists other active members' icons, not your own", () => {
    const members = [
      person('me', 'Me', 'cat'),
      person('b', 'Bruno', 'duck'),
      person('c', 'Carla', 'bee', { active: false }),
      person('d', 'Dado'),
    ]
    expect([...takenAvatarIcons(members, 'me')]).toEqual(['duck'])
  })
})

describe('clashFixSection', () => {
  const clash = (...members) => ({ key: 'k', members })
  it('sends you to your own avatar when you are one of them', () => {
    expect(clashFixSection(clash(person('me', 'A'), person('x', 'A')), { myParticipantId: 'me', isAdmin: false })).toBe(
      'general'
    )
  })
  it('lets anyone fix a clash involving a guest', () => {
    const c = clash(person('g', 'Anna', null, { isGuest: true }), person('x', 'Andrea'))
    expect(clashFixSection(c, { myParticipantId: 'me', isAdmin: false })).toBe('guests')
  })
  it('leaves two other members to them, or to the admin', () => {
    const c = clash(person('x', 'Anna'), person('y', 'Andrea'))
    expect(clashFixSection(c, { myParticipantId: 'me', isAdmin: false })).toBe(null)
    expect(clashFixSection(c, { myParticipantId: 'me', isAdmin: true })).toBe('members')
  })
})

describe('clashSignature', () => {
  it('is the same whatever order the people come in', () => {
    const a = person('a', 'Anna')
    const b = person('b', 'Andrea')
    expect(clashSignature({ key: 'initial:A', members: [a, b] })).toBe(
      clashSignature({ key: 'initial:A', members: [b, a] })
    )
  })
})
