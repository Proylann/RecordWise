import type { ReactElement } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import './ChainWise.css'
import ActivityLogsPage from './pages/ActivityLogs'
import AssistantPage from './pages/Assistant'
import BarangayRecordArchivesPage from './pages/BarangayRecordArchives'
import CertificateIncidentArchivesPage from './pages/CertificateIncidentArchives'
import DashboardPage from './pages/Dashboard'
import LoginPage from './pages/Login'
import AdminActivitiesPage from './pages/admin/AdminActivities'
import AdminArchivesPage from './pages/admin/AdminArchives'
import AdminIncidentsPage from './pages/admin/AdminIncidents'
import AdminLogsPage from './pages/admin/AdminLogs'
import AdminRequestsPage from './pages/admin/AdminRequests'
import AdminResidentsPage from './pages/admin/AdminResidents'
import AdminStaffPage from './pages/admin/AdminStaff'
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

type AccessRole = 'resident' | 'secretary' | 'admin'

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

  if (role === 'admin' && user?.role !== 'admin') {
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
    appRoutes.assistant,
    appRoutes.adminResidents,
    appRoutes.adminStaff,
    appRoutes.adminRequests,
    appRoutes.adminIncidents,
    appRoutes.adminLogs,
    appRoutes.adminActivities,
    appRoutes.adminArchives,
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
            path={appRoutes.assistant}
            element={
              <RequireAuth>
                <AssistantPage />
              </RequireAuth>
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
            path={appRoutes.adminResidents}
            element={
              <RequireAuth role="admin">
                <AdminResidentsPage />
              </RequireAuth>
            }
          />
          <Route
            path={appRoutes.adminStaff}
            element={
              <RequireAuth role="admin">
                <AdminStaffPage />
              </RequireAuth>
            }
          />
          <Route
            path={appRoutes.adminRequests}
            element={
              <RequireAuth role="admin">
                <AdminRequestsPage />
              </RequireAuth>
            }
          />
          <Route
            path={appRoutes.adminIncidents}
            element={
              <RequireAuth role="admin">
                <AdminIncidentsPage />
              </RequireAuth>
            }
          />
          <Route
            path={appRoutes.adminLogs}
            element={
              <RequireAuth role="admin">
                <AdminLogsPage />
              </RequireAuth>
            }
          />
          <Route
            path={appRoutes.adminActivities}
            element={
              <RequireAuth role="admin">
                <AdminActivitiesPage />
              </RequireAuth>
            }
          />
          <Route
            path={appRoutes.adminArchives}
            element={
              <RequireAuth role="admin">
                <AdminArchivesPage />
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
