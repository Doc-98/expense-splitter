// Every "give me every bill/item/share in this group" query in the app used
// to ask Supabase for everything in one shot, with no explicit .range(). That
// was fine while groups were small, but a large group (say, a few thousand
// rows once someone's imported a full Splitwise history) turns each of those
// into one enormous nested-JSON response — exactly the kind of request that's
// prone to silently timing out. And because none of those call sites checked
// `error` either, a failure like that didn't show up as a mistake — it just
// quietly looked like "this group has no bills before March," which is a
// much harder bug to track down than an error message would have been.
//
// Pages are fetched in parallel, not one at a time: the first page's request
// also asks Postgres for the exact total row count — via the caller passing
// `{ count: 'exact' }` as the second argument to its own .select(...) — which
// comes back in that same response, no extra round trip. Once the total is
// known, every remaining page is requested at once via Promise.all instead
// of being awaited one at a time. For a group with a few thousand rows split
// across 2-3 pages, that turns "wait for page 1, then page 2, then page 3"
// into "wait for page 1, then pages 2 and 3 together" — a real difference in
// how long a big group takes to first paint.
//
// A caller that doesn't pass { count: 'exact' } still works — it just falls
// back to fetching one page at a time, the same as before this existed,
// since there's nothing to parallelize without knowing how many pages there
// are. `buildQuery` has to be a *fresh* query each call (a supabase-js query
// builder can only be awaited once), which is why this takes a function that
// builds one, not a query itself.
export async function fetchAllRows(buildQuery, pageSize = 500) {
  const first = await buildQuery().range(0, pageSize - 1)
  if (first.error) throw first.error

  const rows = [...(first.data || [])]
  const total = first.count

  if (total == null) {
    if (!first.data || first.data.length < pageSize) return rows
    let from = pageSize
    for (;;) {
      const { data, error } = await buildQuery().range(from, from + pageSize - 1)
      if (error) throw error
      rows.push(...(data || []))
      if (!data || data.length < pageSize) break
      from += pageSize
    }
    return rows
  }

  if (rows.length >= total) return rows

  const remainingPages = []
  for (let from = pageSize; from < total; from += pageSize) {
    remainingPages.push(buildQuery().range(from, from + pageSize - 1))
  }
  for (const { data, error } of await Promise.all(remainingPages)) {
    if (error) throw error
    rows.push(...(data || []))
  }
  return rows
}
