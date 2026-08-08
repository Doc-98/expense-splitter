import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function JoinGroup() {
  const { code } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState('joining')

  useEffect(() => {
    async function join() {
      const { data: group, error } = await supabase.rpc('join_group_by_code', { invite: code })

      if (error || !group) {
        setStatus(error?.message?.includes('Invalid invite code') ? 'not-found' : 'error')
        return
      }

      navigate(`/groups/${group.id}`, { replace: true })
    }
    join()
  }, [code, user, navigate])

  if (status === 'not-found') {
    return (
      <div className="page">
        <p className="empty-state">That invite link doesn't match any group.</p>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="page">
        <p className="status-error">Couldn't join that group — try again.</p>
      </div>
    )
  }
  return (
    <div className="page">
      <p className="muted">Joining group…</p>
    </div>
  )
}
