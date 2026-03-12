import AdminUserManagementPage from './AdminUserManagement'

function AdminStaffPage() {
  return (
    <AdminUserManagementPage
      role="secretary"
      currentRoute="admin-staff"
      title="Staff Account Creation"
      description="Manage staff credentials and maintain active secretary access for RecordWise operations."
    />
  )
}

export default AdminStaffPage
