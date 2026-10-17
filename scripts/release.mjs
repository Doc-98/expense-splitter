// Creates the GitHub release for the commit just pushed to master, if it's
// a squash-merged PR: tag v1.<PR number> (the same version the app shows),
// named after the PR, with the PR's new WHATS_NEW entries as its notes.
// Run by .github/workflows/release.yml; does nothing for a commit that
// isn't a PR merge, or one whose release already exists, so a re-run is
// harmless.
//
//   GITHUB_TOKEN=… GITHUB_REPOSITORY=owner/repo node scripts/release.mjs [--dry-run]
import { execFileSync } from 'node:child_process'
import { buildReleaseNotes, newEntries, parseWhatsNew, releaseInfo } from '../src/lib/releaseNotes.js'

const dryRun = process.argv.includes('--dry-run')
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
// The file at a given commit, or '' where it didn't exist yet.
const fileAt = (rev, path) => {
  try {
    return git('show', `${rev}:${path}`)
  } catch {
    return ''
  }
}

const sha = git('rev-parse', 'HEAD')
const info = releaseInfo(git('log', '-1', '--format=%s', sha))
if (!info) {
  console.log('Not a squash-merged PR; no release.')
  process.exit(0)
}

const whatsNew = newEntries(
  parseWhatsNew(fileAt(sha, 'src/lib/appVersion.js')),
  parseWhatsNew(fileAt(`${sha}^`, 'src/lib/appVersion.js'))
)
const release = {
  tag_name: info.tag,
  target_commitish: sha,
  name: info.name,
  body: buildReleaseNotes({ whatsNew, prNumber: info.prNumber, mergedOn: git('log', '-1', '--format=%as', sha) }),
  make_latest: 'true',
}

if (dryRun) {
  console.log(JSON.stringify(release, null, 2))
  process.exit(0)
}

const api = `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/releases`
const headers = {
  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

const existing = await fetch(`${api}/tags/${info.tag}`, { headers })
if (existing.ok) {
  console.log(`${info.tag} already has a release; nothing to do.`)
  process.exit(0)
}

const created = await fetch(api, { method: 'POST', headers, body: JSON.stringify(release) })
if (!created.ok) {
  console.error(`Creating ${info.tag} failed: ${created.status} ${await created.text()}`)
  process.exit(1)
}
console.log(`Created ${info.name}: ${(await created.json()).html_url}`)
