// Groups a bill's items by their *effective* category (the item's own, or
// the bill's when it has none — same rule ItemRow uses for its label), for
// BillView's "Grouped by category" layout (Settings > Layout). Groups come
// in the order their first item appears on the receipt, so the list still
// reads top to bottom like the paper it came from; items keep their order
// inside each group; uncategorized items always come last, under "No
// category". Each group carries its subtotal, rounded to the cent.
export function groupItemsByCategory(items, categories, billCategoryId) {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const groups = new Map()
  for (const item of items) {
    const category = byId.get(item.category_id || billCategoryId) || null
    const key = category ? category.id : null
    if (!groups.has(key)) groups.set(key, { key: key ?? 'none', category, items: [], total: 0 })
    const group = groups.get(key)
    group.items.push(item)
    group.total += Number(item.total_price) || 0
  }
  const ordered = [...groups.values()].map((g) => ({ ...g, total: Math.round(g.total * 100) / 100 }))
  return [...ordered.filter((g) => g.category), ...ordered.filter((g) => !g.category)]
}

// What a recap (shared text, PDF) says about a bill's categories:
// `only` names the one category every item shares; otherwise `groups` holds
// the subtotal per category (with "No category" last), when there's more
// than one. Both empty when nothing on the bill has a category, so a recap
// of an uncategorized bill reads as it always did.
export function summarizeCategories(items, categories, billCategoryId) {
  const groups = groupItemsByCategory(items, categories, billCategoryId)
  if (!groups.some((g) => g.category)) return { only: null, groups: [] }
  if (groups.length === 1) return { only: groups[0].category, groups: [] }
  return {
    only: null,
    groups: groups.map((g) => ({ key: g.key, name: g.category?.name ?? 'No category', total: g.total })),
  }
}
