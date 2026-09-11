import { afterEach, describe, it, expect } from 'vitest'
import { getGroupViewPreferences, setGroupViewPreferences, avatarSizeSpec } from './groupViewPreferences'

afterEach(() => {
  localStorage.clear()
})

describe('getGroupViewPreferences', () => {
  it('defaults both display preferences to visible, sticky filters off, and small avatars', () => {
    expect(getGroupViewPreferences()).toEqual({
      showQuickStats: true,
      showLentBorrowedStatus: true,
      stickyFilters: false,
      avatarSize: 'small',
    })
  })

  it('persists a partial update without disturbing the other preferences', () => {
    setGroupViewPreferences({ showQuickStats: false })
    expect(getGroupViewPreferences()).toEqual({
      showQuickStats: false,
      showLentBorrowedStatus: true,
      stickyFilters: false,
      avatarSize: 'small',
    })
  })

  it('applies globally rather than per group — there is no group id involved at all', () => {
    setGroupViewPreferences({ showLentBorrowedStatus: false })
    // Same call signature, same result, regardless of which group's page
    // happens to be asking — the whole point of this preference.
    expect(getGroupViewPreferences().showLentBorrowedStatus).toBe(false)
  })

  it('persists the sticky-filters toggle independently of the others', () => {
    setGroupViewPreferences({ stickyFilters: true })
    expect(getGroupViewPreferences()).toEqual({
      showQuickStats: true,
      showLentBorrowedStatus: true,
      stickyFilters: true,
      avatarSize: 'small',
    })
  })

  it('persists the avatar size independently of the others', () => {
    setGroupViewPreferences({ avatarSize: 'large' })
    expect(getGroupViewPreferences()).toEqual({
      showQuickStats: true,
      showLentBorrowedStatus: true,
      stickyFilters: false,
      avatarSize: 'large',
    })
  })
})

describe('avatarSizeSpec', () => {
  it('grows the icon px and adds a size class for medium and large', () => {
    expect(avatarSizeSpec('small')).toEqual({ iconPx: 14, className: '' })
    expect(avatarSizeSpec('medium')).toEqual({ iconPx: 18, className: 'avatar-md' })
    expect(avatarSizeSpec('large')).toEqual({ iconPx: 22, className: 'avatar-lg' })
  })

  it('falls back to small for an unrecognized size', () => {
    expect(avatarSizeSpec('huge')).toEqual({ iconPx: 14, className: '' })
    expect(avatarSizeSpec(undefined)).toEqual({ iconPx: 14, className: '' })
  })
})
