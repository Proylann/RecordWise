import ResidentDashboardPage from './ResidentDashboard'
import SecretaryDashboardPage from './SecretaryDashboard'
import { useAuth } from '../context/AuthContext'

function DashboardPage() {
  const { user } = useAuth()

  if (user?.role === 'secretary' || user?.role === 'admin') {
    return <SecretaryDashboardPage />
  }

  return <ResidentDashboardPage />
}

export default DashboardPage
