// PGRST116 is PostgREST's code for ".single()/.maybeSingle() got a row
// count other than exactly one" — for every call site in this app that
// filters by a primary key (`.eq('id', someId)`), the only way to actually
// hit that is zero rows, i.e. the row got deleted out from under whatever
// was about to read it (by you in another tab, another device, or another
// group member). Distinguishing that from a real failure lets a page
// recover gracefully (bounce back with a plain-language notice) instead of
// showing PostgREST's own raw wording, which reads like an internal error
// to anyone who isn't the one who wrote the query.
export function isNotFoundError(error) {
  return error?.code === 'PGRST116'
}
