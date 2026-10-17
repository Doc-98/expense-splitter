// Creates the GitHub release for the commit just pushed to master, if it's
// a squash-merged PR: tag v1.<PR number> (the same version the app shows),
// named after the PR, with the PR's new WHATS_NEW entries as its notes.
//
// It first creates any release from scripts/release-history.json that
// doesn't exist yet, oldest first: the notes for PRs #1–#66, merged before
// releases existed here, written by hand from each PR's description
// (WHATS_NEW only started at #39, and wasn't always updated). Once those
// exist, this step finds nothing to do.
//
// Run by .github/workflows/release.yml. A commit that isn't a PR merge, or a
// release that already exists, creates nothing, so a re-run is harmless.
//
//   GITHUB_TOKEN=… GITHUB_REPOSITORY=owner/repo node scripts/release.mjs
//   node scripts/release.mjs --dry-run   (prints what it would create, no API calls)
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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

const history = JSON.parse(readFileSync(new URL('./release-history.json', import.meta.url), 'utf8')).map((pr) => ({
  tag_name: `v1.${pr.pr}`,
  target_commitish: pr.sha,
  name: `v1.${pr.pr} — ${pr.title}`,
  body: buildReleaseNotes({ whatsNew: pr.whatsNew, behindTheScenes: pr.behindTheScenes, prNumber: pr.pr, mergedOn: pr.mergedOn }),
  make_latest: 'false',
}))

function headRelease() {
  const sha = git('rev-parse', 'HEAD')
  const info = releaseInfo(git('log', '-1', '--format=%s', sha))
  if (!info) return null
  const whatsNew = newEntries(
    parseWhatsNew(fileAt(sha, 'src/lib/appVersion.js')),
    parseWhatsNew(fileAt(`${sha}^`, 'src/lib/appVersion.js'))
  )
  return {
    tag_name: info.tag,
    target_commitish: sha,
    name: info.name,
    body: buildReleaseNotes({ whatsNew, prNumber: info.prNumber, mergedOn: git('log', '-1', '--format=%as', sha) }),
    make_latest: 'true',
  }
}

const head = headRelease()
const wanted = [...history.filter((r) => r.tag_name !== head?.tag_name), ...(head ? [head] : [])]

if (dryRun) {
  console.log(`${history.length} releases in the history file, then this merge's:`)
  console.log(head ? JSON.stringify(head, null, 2) : 'none (not a squash-merged PR)')
  process.exit(0)
}

const api = `${process.env.GITHUB_API_URL || 'https://api.github.com'}/repos/${process.env.GITHUB_REPOSITORY}/releases`
const headers = {
  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

async function existingTags() {
  const tags = new Set()
  for (let page = 1; ; page++) {
    const res = await fetch(`${api}?per_page=100&page=${page}`, { headers })
    if (!res.ok) throw new Error(`Listing releases failed: ${res.status} ${await res.text()}`)
    const batch = await res.json()
    for (const release of batch) tags.add(release.tag_name)
    if (batch.length < 100) return tags
  }
}

const existing = await existingTags()
const missing = wanted.filter((r) => !existing.has(r.tag_name))
if (!missing.length) console.log('Every release already exists; nothing to do.')

// A 403 is GitHub refusing the workflow's token permission to create a tag
// on a commit that changes a file under .github/workflows (here #35, #53
// and #67). Those are skipped with a warning so the rest still get made;
// a RELEASE_TOKEN secret with the Workflows permission can create them (see
// release.yml), on the next run. Any other failure stops the run.
const skipped = []
for (const [i, release] of missing.entries()) {
  // GitHub limits how fast content can be created; a first run makes dozens.
  if (i > 0) await new Promise((resolve) => setTimeout(resolve, 1000))
  const res = await fetch(api, { method: 'POST', headers, body: JSON.stringify(release) })
  if (res.status === 403) {
    skipped.push(release.tag_name)
    console.log(`::warning::Not allowed to create ${release.tag_name}: ${await res.text()}`)
    continue
  }
  if (!res.ok) {
    console.error(`Creating ${release.tag_name} failed: ${res.status} ${await res.text()}`)
    process.exit(1)
  }
  console.log(`Created ${release.name}`)
}
if (skipped.length) {
  console.log(
    `::warning::Skipped ${skipped.join(', ')}: their commits change a workflow file, which the built-in token ` +
      'may not tag. Add a RELEASE_TOKEN secret (see release.yml) and re-run this workflow to create them.'
  )
}
