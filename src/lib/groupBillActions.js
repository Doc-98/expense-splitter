import { fetchAllRows } from './fetchAllRows'
import { buildGroupCsvRows, toCsv, downloadCsv } from './csv'

// The group page's share, CSV export and personal-space recap, kept out of
// GroupView.jsx. Sharing and exporting fetch fresh on demand: the page's
// bill list only ever holds lightweight rows, and both are rare enough
// that a dedicated round-trip per click is simpler than keeping every
// bill's full item detail loaded at all times just in case.

const RECAP_BILL_COLUMNS =
  'id, title, note, created_at, paid_by, category_id, items(name, quantity, unit_price, total_price, category_id, item_shares(member_id, shares)), bill_payers(member_id, amount)'

// The bills to share, newest first, with `payers` as formatMultiBillRecap
// (recapText.js) expects them. Throws on failure.
export async function fetchBillsForRecap(supabase, billIds) {
  const { data, error } = await supabase
    .from('bills')
    .select(RECAP_BILL_COLUMNS)
    .in('id', billIds)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map((b) => ({ ...b, payers: b.bill_payers || [] }))
}

// Every bill in the group, oldest first, downloaded as one CSV named after
// the group. Throws on failure.
export async function exportGroupCsv(supabase, { groupId, groupName, members }) {
  const [billsData, { data: categoriesData, error: categoriesError }] = await Promise.all([
    fetchAllRows(() =>
      supabase
        .from('bills')
        .select(
          'id, title, created_at, paid_by, category_id, items(name, quantity, unit_price, total_price, category_id, item_shares(member_id, shares)), bill_payers(member_id, amount)',
          { count: 'exact' }
        )
        .eq('group_id', groupId)
        .order('created_at', { ascending: true })
    ),
    supabase.from('categories').select('id, name').eq('group_id', groupId),
  ])
  if (categoriesError) throw categoriesError

  const bills = billsData.map((b) => ({ ...b, payers: b.bill_payers || [] }))
  const { header, rows } = buildGroupCsvRows(bills, members, categoriesData || [])
  const filename = `${(groupName || 'group').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-bills.csv`
  downloadCsv(filename, toCsv(header, rows))
}

// The personal-space "Share" recap — deliberately built from the bills and
// categories the page already holds rather than a fresh fetch like the two
// above: ShareButton's getText is called synchronously (same as
// formatSettlementRecap's own `settlement` for a real group) and "Download
// as PDF" needs the printed content already sitting in the DOM the instant
// window.print() fires — neither has anywhere to await an async fetch.
// The page's bill rows already carry total_price/category_id per item (see
// fetchGroupBills), which is all a total-and-by-category summary needs;
// only a full itemized transcript (name/quantity per item) would need the
// heavier fetch, and that's exactly what selecting bills and sharing them
// from the list itself already covers.
export function buildPersonalSpaceRecap(group, bills, categories) {
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]))
  const byCategory = new Map() // name -> amount
  let totalSpent = 0
  for (const bill of bills || []) {
    for (const item of bill.items || []) {
      const amount = Number(item.total_price)
      totalSpent += amount
      const name = categoryNameById.get(item.category_id) || 'Uncategorized'
      byCategory.set(name, (byCategory.get(name) || 0) + amount)
    }
  }
  const categoryRows = [...byCategory.entries()]
    .map(([name, amount]) => ({ key: name, name, amount }))
    .sort((a, b) => b.amount - a.amount)
  return { groupName: group?.name, totalSpent, billCount: (bills || []).length, categoryRows }
}
