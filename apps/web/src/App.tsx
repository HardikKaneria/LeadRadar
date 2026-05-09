import { Navigate, Route, Routes } from 'react-router-dom'
import { AppDataProvider } from './contexts/app-data-context'
import { useAuth } from './contexts/auth-context'
import { AppShell } from './components/app-shell'
import { ProtectedRoute } from './components/protected-route'
import { DashboardPage } from './pages/dashboard-page'
import { LeadDetailPage } from './pages/lead-detail-page'
import { LeadsPage } from './pages/leads-page'
import { LoginPage } from './pages/login-page'
import { SettingsPage } from './pages/settings-page'

function AuthenticatedApp() {
  return (
    <AppDataProvider>
      <AppShell />
    </AppDataProvider>
  )
}

function IndexRoute() {
  const { user } = useAuth()

  return <Navigate replace to={user ? '/' : '/login'} />
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AuthenticatedApp />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/leads" element={<LeadsPage />} />
          <Route path="/leads/:leadId" element={<LeadDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<IndexRoute />} />
    </Routes>
  )
}

export default App
