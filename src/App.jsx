import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { AuthProvider, useAuth } from './context/AuthContext'
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

  return children
}

function Shell() {
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
        <Analytics />
      </BrowserRouter>
    </AuthProvider>
  )
}
