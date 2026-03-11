import type { ReactElement } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import './ChainWise.css'
import ActivityLogsPage from './pages/ActivityLogs'
import BarangayRecordArchivesPage from './pages/BarangayRecordArchives'
import CertificateIncidentArchivesPage from './pages/CertificateIncidentArchives'
import DashboardPage from './pages/Dashboard'
import LoginPage from './pages/Login'
import ProcessRequestPage from './pages/ProcessRequest'
import ProfilePage from './pages/Profile'
import RecordsQueuePage from './pages/RecordsQueue'
import RegisterPage from './pages/Register'
import ReportProblemPage from './pages/ReportProblem'
import RequestRecordPage from './pages/RequestRecord'
import SecretaryReportsPage from './pages/SecretaryReports'
import SecretaryRequestsPage from './pages/SecretaryRequests'
import SubmitRecordPage from './pages/SubmitRecord'
import { useAuth } from './context/AuthContext'
import { appRoutes } from './lib/routes'

type AccessRole = 'resident' | 'secretary'

function RequireAuth({ children, role }: { children: ReactElement; role?: AccessRole }) {
  const { isAuthenticated, user } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to={appRoutes.login} replace />
  }

  if (role === 'resident' && user?.role !== 'resident') {
    return <Navigate to={appRoutes.dashboard} replace />
  }

  if (role === 'secretary' && user?.role !== 'secretary' && user?.role !== 'admin') {
    return <Navigate to={appRoutes.dashboard} replace />
  }

  return children
}

function RequireGuest({ children }: { children: ReactElement }) {
  const { isAuthenticated } = useAuth()
  if (isAuthenticated) {
    return <Navigate to={appRoutes.dashboard} replace />
  }
  return children
}

function AppFrame() {
  const location = useLocation()
  const workspaceRoutes: string[] = [
    appRoutes.dashboard,
    appRoutes.requestRecord,
    appRoutes.recordsQueue,
    appRoutes.reportProblem,
    appRoutes.secretaryRequests,
    appRoutes.processRequest,
    appRoutes.secretaryReports,
    appRoutes.archiveRecords,
    appRoutes.certificateIncidentArchives,
    appRoutes.barangayRecordArchives,
    appRoutes.activityLogs,
    appRoutes.profile,
  ]
  const isWorkspaceRoute = workspaceRoutes.includes(location.pathname)

  return (
    <div className={isWorkspaceRoute ? 'app-frame app-frame--dashboard' : 'app-frame'}>
      <div className={isWorkspaceRoute ? 'page-shell page-shell--dashboard' : 'page-shell'}>
        <Routes>
          <Route path="/" element={<Navigate to={appRoutes.login} replace />} />
          <Route
            path={appRoutes.login}
            element={
              <RequireGuest>
                <LoginPage />
              </RequireGuest>
            }
          />
          <Route
            path={appRoutes.register}
            element={
              <RequireGuest>
                <RegisterPage />
              </RequireGuest>
            }
          />
          <Route
            path={appRoutes.dashboard}
            element={
              <RequireAuth>
                <DashboardPage />
              </RequireAuth>
            }
          />
          <Route
            path={appRoutes.requestRecord}
            element={
              <RequireAuth role="resident">
                <RequestRecordPage />
              </RequireAuth>
            }
          />
          <Route
            path={appRoutes.recordsQueue}
            element={
              <RequireAuth role="resident">
                <RecordsQueuePage />
              </RequireAuth>
            }
          />
          <Route
            path={appRoutes.reportProblem}
            element={
              <RequireAuth role="resident">
                <ReportProblemPage />
              </RequireAuth>
            }
          />
          <Route
            path={appRoutes.secretaryRequests}
            element={
              <RequireAuth role="secretary">
                <SecretaryRequestsPage />
              </RequireAuth>
            }
          />
          <Route
            path={appRoutes.processRequest}
            element={
              <RequireAuth role="secretary">
                <ProcessRequestPage />
              </RequireAuth>
            }
          />
          <Route
            path={appRoutes.secretaryReports}
            element={
              <RequireAuth role="secretary">
                <SecretaryReportsPage />
              </RequireAuth>
            }
          />
          <Route
            path={appRoutes.archiveRecords}
            element={
              <RequireAuth role="secretary">
                <SubmitRecordPage />
              </RequireAuth>
            }
          />
          <Route
            path={appRoutes.certificateIncidentArchives}
            element={
              <RequireAuth role="secretary">
                <CertificateIncidentArchivesPage />
              </RequireAuth>
            }
          />
          <Route
            path={appRoutes.barangayRecordArchives}
            element={
              <RequireAuth role="secretary">
                <BarangayRecordArchivesPage />
              </RequireAuth>
            }
          />
          <Route
            path={appRoutes.activityLogs}
            element={
              <RequireAuth role="secretary">
                <ActivityLogsPage />
              </RequireAuth>
            }
          />
          <Route
            path={appRoutes.profile}
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to={appRoutes.login} replace />} />
        </Routes>
      </div>
    </div>
  )
}

function App() {
  return <AppFrame />
}

export default App
