// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { WHATS_NEW } from './appVersion'
import { buildReleaseNotes, newEntries, parseWhatsNew, releaseInfo } from './releaseNotes'

const appVersionSource = (entries) => `export const APP_VERSION = import.meta.env.VITE_APP_VERSION

// A comment that mentions WHATS_NEW = [ in passing.
export const WHATS_NEW = [
${entries}
]
`

describe('parseWhatsNew', () => {
  it('reads every quoting style the list has used', () => {
    const source = appVersionSource(`  "Double \\"quoted\\"",
  'Single, with an apostrophe\\'s escape',
  \`Template, "with" quotes\`,`)
    expect(parseWhatsNew(source)).toEqual([
      'Double "quoted"',
      "Single, with an apostrophe's escape",
      'Template, "with" quotes',
    ])
  })

  it('reads the real file', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/lib/appVersion.js'), 'utf8')
    expect(parseWhatsNew(source)).toEqual(WHATS_NEW)
  })

  it('is empty for a file without the list', () => {
    expect(parseWhatsNew('export const APP_VERSION = "dev"\n')).toEqual([])
    expect(parseWhatsNew('')).toEqual([])
  })
})

describe('newEntries', () => {
  it("drops entries carried over from the previous release's list", () => {
    expect(newEntries(['old', 'new one', 'new two'], ['old', 'gone'])).toEqual(['new one', 'new two'])
  })

  it('is empty when the list was not touched', () => {
    expect(newEntries(['a', 'b'], ['a', 'b'])).toEqual([])
  })
})

describe('releaseInfo', () => {
  it('names the release after the squash-merge subject', () => {
    expect(releaseInfo('Put the design system in the repo, and test it against the app (#65)')).toEqual({
      tag: 'v1.65',
      prNumber: 65,
      name: 'v1.65 — Put the design system in the repo, and test it against the app',
    })
  })

  it('is null for a commit that is not a PR merge', () => {
    expect(releaseInfo('Merge pull request #18 from someone/branch')).toBeNull()
    expect(releaseInfo('Fix a typo')).toBeNull()
  })
})

describe('buildReleaseNotes', () => {
  it('lists what changed, then where it was merged', () => {
    expect(buildReleaseNotes({ whatsNew: ['One', 'Two'], prNumber: 66, mergedOn: '2026-10-17' })).toBe(
      '- One\n- Two\n\nMerged in #66 on 2026-10-17.\n'
    )
  })

  it('adds behind-the-scenes changes under their own heading', () => {
    expect(buildReleaseNotes({ whatsNew: ['Seen'], behindTheScenes: ['Unseen'], prNumber: 5 })).toBe(
      '- Seen\n\n**Behind the scenes**\n\n- Unseen\n\nMerged in #5.\n'
    )
  })

  it('says so when nothing changed in the app', () => {
    expect(buildReleaseNotes({ prNumber: 60 })).toBe('No changes you would notice in the app.\n\nMerged in #60.\n')
  })
})
