import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { fetchThresholds } from '../lib/thresholds'
import { fetchBillsForGroups } from '../lib/groupViewSnapshot'
import { deriveBillsItemsShares } from '../lib/deriveBillData'
import { mergeCategoriesByName } from '../lib/categories'
import { categoryColor } from '../lib/categoryPalette'
import { budgetComparisonRange } from '../lib/budgetPeriod'
import { budgetRows, makeSpendForRange } from '../lib/budgets'
import { loadErrorMessage } from '../lib/loadErrorMessage'
import BudgetBars from './BudgetBars'

// "Your budgets" on a group's stats page: your personal budgets for the
// categories this group has, measured exactly as Your Stats measures them
// (your own share, this week or month, across every group and any you've
// left), plus how much of that was spent in this group. Loads its own data,
// and only when you have budgets at all, so the rest of the page never
// waits on it; it only needs the current week or month of every group.
export default function GroupBudgetsSection({ groupId, budgetPeriod }) {
  const { user } = useAuth()
  const [budgets, setBudgets] = useState(null) // { rows, hereByKey } once loaded
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const thresholds = await fetchThresholds(user.id)
      if (thresholds.length === 0) return null
      const range = budgetComparisonRange(budgetPeriod)

      const [memberResult, snapshotResult] = await Promise.all([
        supabase.from('group_members').select('id, group_id').eq('user_id', user.id).eq('active', true),
        supabase.from('departure_snapshots').select('group_id, daily_totals').eq('user_id', user.id),
      ])
      if (memberResult.error) throw memberResult.error
      if (snapshotResult.error) throw snapshotResult.error
      const groupIds = memberResult.data.map((m) => m.group_id)
      const myParticipantIds = new Set(memberResult.data.map((m) => m.id))
      if (!groupIds.includes(groupId)) return null

      const [categoriesResult, billsData] = await Promise.all([
        supabase.from('categories').select('id, name, color, group_id').in('group_id', groupIds),
        fetchBillsForGroups(supabase, groupIds, { since: range.start }),
      ])
      if (categoriesResult.error) throw categoriesResult.error
      const categories = categoriesResult.data || []
      const { list: bills, items, itemShares } = deriveBillsItemsShares(billsData)
      const shared = { items, itemShares, myParticipantIds, categoryNameById: new Map(categories.map((c) => [c.id, c.name])) }

      const everywhere = makeSpendForRange({
        ...shared,
        bills,
        snapshots: (snapshotResult.data || []).filter((s) => !groupIds.includes(s.group_id)),
      })(range)
      const here = makeSpendForRange({ ...shared, bills: bills.filter((b) => b.group_id === groupId) })(range)

      const thisGroupsCategories = new Set(
        categories.filter((c) => c.group_id === groupId).map((c) => c.name.trim().toLowerCase())
      )
      const colorByKey = new Map(mergeCategoriesByName(categories).map((c) => [c.name.toLowerCase(), c.color]))
      const rows = budgetRows(thresholds, everywhere, budgetPeriod)
        .filter((row) => thisGroupsCategories.has(row.key))
        .map((row) => ({ ...row, color: categoryColor(colorByKey.get(row.key)) }))
      return { rows, hereByKey: Object.fromEntries(rows.map((row) => [row.key, here[row.key]?.amount || 0])) }
    }

    load()
      .then((result) => !cancelled && setBudgets(result))
      .catch((err) => !cancelled && setError(loadErrorMessage(err)))
    return () => {
      cancelled = true
    }
  }, [groupId, user.id, budgetPeriod])

  if (error) return <p className="status-error">Couldn&rsquo;t load your budgets: {error}</p>
  if (!budgets || budgets.rows.length === 0) return null

  return (
    <section className="stats-section">
      <h2 className="settings-section-title">Your budgets</h2>
      <BudgetBars rows={budgets.rows} hereByKey={budgets.hereByKey} />
      <p className="muted stats-note">
        Your own share {budgetPeriod === 'week' ? 'this week (Monday–Sunday)' : 'this month'}, across all your
        groups, for the categories this group has. The full history is on <strong>Your Stats</strong>; budgets
        are set in <strong>Settings → Budgets</strong>.
      </p>
    </section>
  )
}
