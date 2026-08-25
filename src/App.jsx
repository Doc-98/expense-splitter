import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { CurrencyProvider } from './context/CurrencyContext'
import AppHeader from './components/AppHeader'
import Login from './pages/Login'
import Groups from './pages/Groups'
import GroupView from './pages/GroupView'
import BillView from './pages/BillView'
import JoinGroup from './pages/JoinGroup'
import ClaimGuest from './pages/ClaimGuest'
import RecurringBills from './pages/RecurringBills'
import About from './pages/About'
import Guide from './pages/Guide'
import GroupSettings from './pages/GroupSettings'
import GroupStats from './pages/GroupStats'
import AccountStats from './pages/AccountStats'
import ScanSettings from './pages/ScanSettings'
import Thresholds from './pages/Thresholds'

// A one-time-use flow for most people — kept out of the main bundle
// entirely (same reasoning as lazy-loading Tesseract.js) so its code, and
// the CSV/Splitwise parsing logic it pulls in, is only fetched by whoever
// actually opens it.
const ImportBills = lazy(() => import('./pages/ImportBills'))
// Same reasoning as ImportBills above — a wizard almost nobody opens more
// than once, right after a big import.
const CategorizeBills = lazy(() => import('./pages/CategorizeBills'))
// A second, more visual stats page most people will never open at all —
// deliberately a separate page from Your Stats/Group Stats rather than
// folded into them, so its charts (and the SVG chart components they pull
// in) never cost anyone who just wants the plain numbers anything.
const AccountGraphs = lazy(() => import('./pages/AccountGraphs'))
const GroupGraphs = lazy(() => import('./pages/GroupGraphs'))

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
      <Route path="/claim/:token" element={<RequireAuth><ClaimGuest /></RequireAuth>} />
      <Route path="/about" element={<RequireAuth><About /></RequireAuth>} />
      <Route path="/guide" element={<RequireAuth><Guide /></RequireAuth>} />
      <Route path="/stats" element={<RequireAuth><AccountStats /></RequireAuth>} />
      <Route
        path="/stats/graphs"
        element={
          <RequireAuth>
            <Suspense fallback={<div className="page-loading">Loading…</div>}>
              <AccountGraphs />
            </Suspense>
          </RequireAuth>
        }
      />
      <Route path="/scan-settings" element={<RequireAuth><ScanSettings /></RequireAuth>} />
      <Route path="/thresholds" element={<RequireAuth><Thresholds /></RequireAuth>} />
      <Route path="/" element={<RequireAuth><Groups /></RequireAuth>} />
      <Route path="/groups/:groupId" element={<RequireAuth><GroupView /></RequireAuth>} />
      <Route path="/groups/:groupId/settings" element={<RequireAuth><GroupSettings /></RequireAuth>} />
      <Route path="/groups/:groupId/stats" element={<RequireAuth><GroupStats /></RequireAuth>} />
      <Route
        path="/groups/:groupId/stats/graphs"
        element={
          <RequireAuth>
            <Suspense fallback={<div className="page-loading">Loading…</div>}>
              <GroupGraphs />
            </Suspense>
          </RequireAuth>
        }
      />
      <Route
        path="/groups/:groupId/import"
        element={
          <RequireAuth>
            <Suspense fallback={<div className="page-loading">Loading…</div>}>
              <ImportBills />
            </Suspense>
          </RequireAuth>
        }
      />
      <Route path="/groups/:groupId/bills/:billId" element={<RequireAuth><BillView /></RequireAuth>} />
      <Route path="/groups/:groupId/recurring" element={<RequireAuth><RecurringBills /></RequireAuth>} />
      <Route
        path="/groups/:groupId/categorize"
        element={
          <RequireAuth>
            <Suspense fallback={<div className="page-loading">Loading…</div>}>
              <CategorizeBills />
            </Suspense>
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <CurrencyProvider>
        <AuthProvider>
          <BrowserRouter>
            <Shell />
          </BrowserRouter>
        </AuthProvider>
      </CurrencyProvider>
    </ThemeProvider>
  )
}
