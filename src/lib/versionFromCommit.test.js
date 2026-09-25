// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parseVersionFromCommitMessage, findLatestVersion } from './versionFromCommit'

describe('parseVersionFromCommitMessage', () => {
  it('extracts the PR number from a squash-merge commit subject', () => {
    expect(parseVersionFromCommitMessage('Add sticky filters (#43)')).toBe('v1.43')
    expect(parseVersionFromCommitMessage('How to Use guide revamp (#44)')).toBe('v1.44')
  })

  it('only matches when the "(#123)" is at the very end of the subject', () => {
    expect(parseVersionFromCommitMessage('Fix (#12) typo in copy')).toBeNull()
  })

  it('tolerates trailing whitespace after the PR number', () => {
    expect(parseVersionFromCommitMessage('Ship it (#7)  ')).toBe('v1.7')
  })

  it('returns null for a commit subject with no PR number', () => {
    expect(parseVersionFromCommitMessage('initial commit')).toBeNull()
    expect(parseVersionFromCommitMessage('Install and Configure Vercel Web Analytics')).toBeNull()
  })

  it('returns null for null/undefined/empty input', () => {
    expect(parseVersionFromCommitMessage(null)).toBeNull()
    expect(parseVersionFromCommitMessage(undefined)).toBeNull()
    expect(parseVersionFromCommitMessage('')).toBeNull()
  })
})

describe('findLatestVersion', () => {
  it('returns the version from the first (newest) subject that has a PR number', () => {
    const subjects = [
      'Press-and-hold to select a bill',
      'Version numbering follow-up',
      'How to Use guide revamp + README pass (#44)',
      'Sticky filters, price math expressions, and more (#43)',
    ]
    expect(findLatestVersion(subjects)).toBe('v1.44')
  })

  it('falls through unnumbered commits to find the latest merged PR', () => {
    expect(findLatestVersion(['wip', 'another wip', 'Ship it (#10)'])).toBe('v1.10')
  })

  it('returns null when no subject in the list has a PR number', () => {
    expect(findLatestVersion(['initial commit', 'wip', 'more wip'])).toBeNull()
  })

  it('returns null for an empty list', () => {
    expect(findLatestVersion([])).toBeNull()
  })
})
