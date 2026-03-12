import AdminUserManagementPage from './AdminUserManagement'

function AdminResidentsPage() {
  return (
    <AdminUserManagementPage
      role="resident"
      currentRoute="admin-residents"
      title="Resident Management"
      description="Create, update, archive, and restore resident accounts from the admin workspace."
    />
  )
}

export default AdminResidentsPage
