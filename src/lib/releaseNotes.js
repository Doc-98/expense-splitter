// Builds a GitHub release for a merged PR — see scripts/release.mjs, which
// .github/workflows/release.yml runs on every push to master. Kept pure
// (file text and commit subjects in, strings out) so it's unit-tested
// without git or the GitHub API, same as versionFromCommit.js.
//
// A release's notes are WHATS_NEW as of the merge, minus any entry the list
// already had before it: WHATS_NEW is meant to be replaced each PR, but has
// sometimes kept a previous release's entries, and those belong to that
// release, not this one.
import { parseVersionFromCommitMessage } from './versionFromCommit.js'

const WHATS_NEW_RE = /export const WHATS_NEW = (\[[\s\S]*?\n\])/

// The WHATS_NEW array out of appVersion.js's source text, or [] if the file
// has none (it didn't exist before PR #39). It's a plain array of string
// literals, so it's evaluated as one rather than parsed by hand.
export function parseWhatsNew(source) {
  const match = WHATS_NEW_RE.exec(source || '')
  if (!match) return []
  const list = new Function(`"use strict"; return ${match[1]}`)()
  return Array.isArray(list) ? list.filter((entry) => typeof entry === 'string') : []
}

export function newEntries(current, previous) {
  const before = new Set(previous)
  return current.filter((entry) => !before.has(entry))
}

// { tag: 'v1.65', name: 'v1.65 — Put the design system in the repo' } for a
// squash-merge subject, or null for a commit that isn't one (a direct push).
export function releaseInfo(subject) {
  const tag = parseVersionFromCommitMessage(subject)
  if (!tag) return null
  const title = subject.replace(/\s*\(#\d+\)\s*$/, '')
  return { tag, prNumber: Number(tag.slice(3)), name: `${tag} — ${title}` }
}

const bullets = (entries) => entries.map((entry) => `- ${entry}`).join('\n')

// `whatsNew` is what someone using the app would notice; `behindTheScenes`
// is for releases with changes nobody would see in the app (tests, tooling,
// docs), so they don't read as empty.
export function buildReleaseNotes({ whatsNew = [], behindTheScenes = [], prNumber, mergedOn }) {
  const parts = []
  if (whatsNew.length) parts.push(bullets(whatsNew))
  if (behindTheScenes.length) parts.push(`**Behind the scenes**\n\n${bullets(behindTheScenes)}`)
  if (!parts.length) parts.push('No changes you would notice in the app.')
  parts.push(`Merged in #${prNumber}${mergedOn ? ` on ${mergedOn}` : ''}.`)
  return `${parts.join('\n\n')}\n`
}
