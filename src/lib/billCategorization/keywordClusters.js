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
// Word significance is judged purely by "shows up in enough different
// titles to be worth surfacing, but not in so many that it's clearly just
// a connector," not by meaning — no stopword list, no language assumption
// (this app's own bill titles are as likely to be Italian as English). A
// hand-curated stopword list would silently hide a real pattern in a
// language it didn't anticipate; `maxGroupShare` below is the
// language-agnostic substitute — a statistical cap, not a word list.
const DEFAULT_OPTIONS = {
  minTokenLength: 4,
  minGroups: 2,
  maxClusters: 15,
  // A token sitting in more than this fraction of *all* distinct titles
  // is far more likely a connector shared across unrelated merchants
  // (a weekday, "via", "presso", a generic "bolletta"/"ricevuta" prefix)
  // than an actual merchant name — and applying one category to that many
  // groups at once from a single click is exactly the kind of surprise
  // this feature shouldn't spring on anyone. Only kicks in once there are
  // enough groups for "share of the total" to mean anything.
  maxGroupShare: 0.25,
  minGroupsForShareCap: 8,
}

function tokenize(title) {
  return (
    title
      .toLowerCase()
      // Insert a boundary between a letter and an adjacent digit first —
      // titles are often typed with no separator between a merchant name
      // and an attached date or number ("Lidl24Agosto", "Conad12"), and
      // without this the merchant name never re-forms as the same token
      // twice: every occurrence gets fused to whatever number sits next to
      // it that time, fragmenting one real, big pattern into many
      // one-off ones that never reach `minGroups`.
      .replace(/(\p{L})(\p{N})/gu, '$1 $2')
      .replace(/(\p{N})(\p{L})/gu, '$1 $2')
      .split(/[^\p{L}\p{N}]+/u) // split on anything that isn't a letter/digit, Unicode-aware (accented letters included)
      .filter((token) => token.length > 0 && !/^\d+$/.test(token)) // pure numbers are dates/invoice numbers, not merchant names
  )
}

export function findKeywordClusters(groups, options = {}) {
  const { minTokenLength, minGroups, maxClusters, maxGroupShare, minGroupsForShareCap } = {
    ...DEFAULT_OPTIONS,
    ...options,
  }
  const groupKeysByToken = new Map() // token -> Set of group keys

  for (const group of groups) {
    const tokens = new Set(tokenize(group.title).filter((t) => t.length >= minTokenLength))
    for (const token of tokens) {
      if (!groupKeysByToken.has(token)) groupKeysByToken.set(token, new Set())
      groupKeysByToken.get(token).add(group.key)
    }
  }

  const groupByKey = new Map(groups.map((g) => [g.key, g]))
  const shareCapApplies = groups.length >= minGroupsForShareCap
  const clusters = []
  for (const [keyword, groupKeySet] of groupKeysByToken) {
    if (groupKeySet.size < minGroups) continue
    if (shareCapApplies && groupKeySet.size / groups.length > maxGroupShare) continue
    const groupKeys = [...groupKeySet]
    const billCount = groupKeys.reduce((sum, key) => sum + (groupByKey.get(key)?.billIds.length || 0), 0)
    clusters.push({ keyword, groupKeys, billCount })
  }

  // Biggest patterns first — the household's actual regular merchants,
  // not a word that happens to recur in three titles' worth of noise.
  clusters.sort((a, b) => b.billCount - a.billCount)
  return clusters.slice(0, maxClusters)
}
