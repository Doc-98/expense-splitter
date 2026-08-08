import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { computeBalances, simplifyDebts } from '../lib/settlement'
import SettlementSummary from '../components/SettlementSummary'

export default function GroupView() {
  const { groupId } = useParams()
  const { user } = useAuth()

  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [bills, setBills] = useState(null)
  const [newBillTitle, setNewBillTitle] = useState('')
  const [copied, setCopied] = useState(false)
  const [settlement, setSettlement] = useState(null)

  const loadGroup = useCallback(async () => {
    const { data } = await supabase.from('groups').select('*').eq('id', groupId).single()
    setGroup(data)
  }, [groupId])

  const loadMembers = useCallback(async () => {
    const { data } = await supabase
      .from('group_members')
      .select('user_id, profiles(display_name)')
      .eq('group_id', groupId)
    setMembers((data || []).map((row) => ({ id: row.user_id, name: row.profiles?.display_name || 'Someone' })))
  }, [groupId])

  const loadBills = useCallback(async () => {
    const { data } = await supabase
      .from('bills')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
    setBills(data || [])
  }, [groupId])

  const loadSettlement = useCallback(async () => {
    const { data: billsData } = await supabase
      .from('bills')
      .select('id, paid_by, items(id, total_price, item_shares(user_id, shares))')
      .eq('group_id', groupId)

    if (!billsData) return

    const items = []
    const itemShares = []
    for (const bill of billsData) {
      for (const item of bill.items || []) {
        items.push({ id: item.id, bill_id: bill.id, total_price: item.total_price })
        for (const share of item.item_shares || []) {
          itemShares.push({ item_id: item.id, user_id: share.user_id, shares: share.shares })
        }
      }
    }

    const balances = computeBalances({ bills: billsData, items, itemShares })
    setSettlement(simplifyDebts(balances))
  }, [groupId])

  const reloadAll = useCallback(() => {
    loadBills()
    loadSettlement()
  }, [loadBills, loadSettlement])

  useEffect(() => {
    loadGroup()
    loadMembers()
    reloadAll()

    const channel = supabase
      .channel(`group-${groupId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, reloadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, reloadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_shares' }, reloadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, loadMembers)
      .subscribe()

    return () => supabase.removeChannel(channel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  async function createBill(e) {
    e.preventDefault()
    const { data, error } = await supabase
      .from('bills')
      .insert({
        group_id: groupId,
        title: newBillTitle.trim() || 'New bill',
        created_by: user.id,
        paid_by: user.id,
      })
      .select()
      .single()

    if (!error) {
      setNewBillTitle('')
      window.location.href = `/groups/${groupId}/bills/${data.id}`
    }
  }

  function copyInvite() {
    const link = `${window.location.origin}/join/${group.invite_code}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="page">
      <header className="page-header">
        <Link to="/" className="btn-link">
          ← Groups
        </Link>
        <h1>{group?.name}</h1>
      </header>

      <div className="group-actions">
        <button className="btn-secondary" onClick={copyInvite}>
          {copied ? 'Link copied!' : 'Copy invite link'}
        </button>
        <span className="muted">{members.length} {members.length === 1 ? 'person' : 'people'}</span>
      </div>

      <form onSubmit={createBill} className="inline-form">
        <input
          value={newBillTitle}
          onChange={(e) => setNewBillTitle(e.target.value)}
          placeholder="New bill (e.g. Lidl - Tuesday)"
        />
        <button type="submit" className="btn-primary">
          Start
        </button>
      </form>

      {bills?.length === 0 && (
        <p className="empty-state">No bills yet. Start one above, then scan or add a receipt.</p>
      )}

      <ul className="card-list">
        {bills?.map((bill) => (
          <li key={bill.id}>
            <Link to={`/groups/${groupId}/bills/${bill.id}`} className="card-list-item">
              <span>{bill.title}</span>
              <span className="chevron">→</span>
            </Link>
          </li>
        ))}
      </ul>

      <SettlementSummary transactions={settlement} members={members} />
    </div>
  )
}
