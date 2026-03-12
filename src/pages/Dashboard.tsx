import AdminDashboardPage from './admin/AdminDashboard'
import ResidentDashboardPage from './ResidentDashboard'
import SecretaryDashboardPage from './SecretaryDashboard'
import { useAuth } from '../context/AuthContext'

function DashboardPage() {
  const { user } = useAuth()

  if (user?.role === 'admin') {
    return <AdminDashboardPage />
  }

  if (user?.role === 'secretary') {
    return <SecretaryDashboardPage />
  }

  return <ResidentDashboardPage />
}

export default DashboardPage
