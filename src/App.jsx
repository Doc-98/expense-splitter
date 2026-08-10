import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import AppHeader from './components/AppHeader'
import Login from './pages/Login'
import Groups from './pages/Groups'
import GroupView from './pages/GroupView'
import BillView from './pages/BillView'
import JoinGroup from './pages/JoinGroup'

function RequireAuth({ children }) {
  const { session } = useAuth()
  const location = useLocation()

  if (session === undefined) return <div className="page-loading">Loading…</div>

  if (session === null) {
    sessionStorage.setItem('redirectAfterLogin', location.pathname)
    return <Navigate to="/login" replace />
  }

  return (
    <>
      <AppHeader />
      {children}
    </>
  )
}

function Shell() {
  const { session } = useAuth()
  const navigate = useNavigate()

  // Whenever a session appears — whether from a password sign-in, clicking a
  // magic-link email, or confirming a new account by email — check if we
  // owe the person a trip back to wherever they originally tried to go
  // (e.g. an invite link) and finish that journey automatically.
  useEffect(() => {
    if (!session) return
    const next = sessionStorage.getItem('redirectAfterLogin')
    if (next) {
      sessionStorage.removeItem('redirectAfterLogin')
      navigate(next, { replace: true })
    }
  }, [session, navigate])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/join/:code" element={<RequireAuth><JoinGroup /></RequireAuth>} />
      <Route path="/" element={<RequireAuth><Groups /></RequireAuth>} />
      <Route path="/groups/:groupId" element={<RequireAuth><GroupView /></RequireAuth>} />
      <Route path="/groups/:groupId/bills/:billId" element={<RequireAuth><BillView /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </AuthProvider>
  )
}
