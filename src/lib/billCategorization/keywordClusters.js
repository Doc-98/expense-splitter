// A long history tends to repeat the same handful of merchants under
// titles that aren't quite identical — "Lidl - martedì", "LIDL 12/03",
// "Lidl via Roma" are three different exact titles (so three separate
// entries in buildTitleGroups()'s output) even though a person would
// recognize all three as "the same supermarket" at a glance. This finds
// that pattern — a word repeated across *several distinct title groups*
// — so the review screen can offer "set one category for everything
// matching 'lidl'" as a single action, rather than clicking through each
// slightly-different title on its own.
//
// Deliberately not fed into the AI pass or used to auto-apply anything —
// this only ever *surfaces a suggestion*; a person still picks the
// category and clicks apply. Word significance is judged purely by
// "shows up in enough different titles to be worth surfacing," not by
// meaning — no stopword list, no language assumption (this app's own
// bill titles are as likely to be Italian as English) — a short/common
// word that happens to recur is still shown; a person skims past a
// meaningless one for free, but a hand-curated stopword list would
// silently hide a real pattern in a language it didn't anticipate.
// `minTokenLength` alone is what keeps single/double-letter noise out.
const DEFAULT_OPTIONS = {
  minTokenLength: 4,
  minGroups: 2,
  maxClusters: 15,
}

function tokenize(title) {
  return title
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u) // split on anything that isn't a letter/digit, Unicode-aware (accented letters included)
    .filter((token) => token.length > 0 && !/^\d+$/.test(token)) // pure numbers are dates/invoice numbers, not merchant names
}

export function findKeywordClusters(groups, options = {}) {
  const { minTokenLength, minGroups, maxClusters } = { ...DEFAULT_OPTIONS, ...options }
  const groupKeysByToken = new Map() // token -> Set of group keys

  for (const group of groups) {
    const tokens = new Set(tokenize(group.title).filter((t) => t.length >= minTokenLength))
    for (const token of tokens) {
      if (!groupKeysByToken.has(token)) groupKeysByToken.set(token, new Set())
      groupKeysByToken.get(token).add(group.key)
    }
  }

  const groupByKey = new Map(groups.map((g) => [g.key, g]))
  const clusters = []
  for (const [keyword, groupKeySet] of groupKeysByToken) {
    if (groupKeySet.size < minGroups) continue
    const groupKeys = [...groupKeySet]
    const billCount = groupKeys.reduce((sum, key) => sum + (groupByKey.get(key)?.billIds.length || 0), 0)
    clusters.push({ keyword, groupKeys, billCount })
  }

  // Biggest patterns first — the household's actual regular merchants,
  // not a word that happens to recur in three titles' worth of noise.
  clusters.sort((a, b) => b.billCount - a.billCount)
  return clusters.slice(0, maxClusters)
}
