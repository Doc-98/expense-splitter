import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import EmptyState from '../components/EmptyState'
import { GroupsNavIcon } from '../components/icons'

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
        <EmptyState
          icon={GroupsNavIcon}
          title="This invite link doesn't work"
          action={
            <Link to="/" className="btn-secondary">
              Go to your groups
            </Link>
          }
        >
          It doesn't match any group. Ask whoever sent it for a fresh link.
        </EmptyState>
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
