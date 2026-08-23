// Every "give me every bill/item/share in this group" query in the app used
// to ask Supabase for everything in one shot, with no explicit .range(). That
// was fine while groups were small, but a large group (say, a few thousand
// rows once someone's imported a full Splitwise history) turns each of those
// into one enormous nested-JSON response — exactly the kind of request that's
// prone to silently timing out or getting rejected somewhere between the
// browser and Postgres. And because none of those call sites checked `error`
// either, a failure like that didn't show up as a mistake — it just quietly
// looked like "this group has no bills before March," which is a much
// harder bug to track down than an error message would have been.
//
// fetchAllRows fetches in fixed-size pages via .range() and concatenates the
// results, so no single request has to carry the whole table — and it always
// throws on the first page that comes back with an error, rather than
// swallowing it. `buildQuery` has to be a *fresh* query each call (a
// supabase-js query builder can only be awaited once), which is why this
// takes a function that builds one, not a query itself.
export async function fetchAllRows(buildQuery, pageSize = 500) {
  const rows = []
  let from = 0

  for (;;) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) throw error

    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
    from += pageSize
  }

  return rows
}
