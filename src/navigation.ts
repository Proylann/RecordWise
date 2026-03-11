import type { DashboardNavItem } from './components/DashboardLayout'
import { appRoutes } from './lib/routes'

export function getWorkspaceNav(role?: string): DashboardNavItem[] {
  if (role === 'secretary' || role === 'admin') {
    return [
      { label: 'Dashboard', href: appRoutes.dashboard, route: 'dashboard' },
      { label: 'Requests', href: appRoutes.secretaryRequests, route: 'secretary-requests' },
      { label: 'Incident Reports', href: appRoutes.secretaryReports, route: 'secretary-reports' },
      { label: 'Upload Archive', href: appRoutes.archiveRecords, route: 'archive-records' },
      {
        label: 'Archived Records',
        children: [
          {
            label: 'Certificate and Incident Archives',
            href: appRoutes.certificateIncidentArchives,
            route: 'certificate-incident-archives',
          },
          {
            label: 'Barangay Record Archives',
            href: appRoutes.barangayRecordArchives,
            route: 'barangay-record-archives',
          },
        ],
      },
      { label: 'Activity Logs', href: appRoutes.activityLogs, route: 'activity-logs' },
      { label: 'Profile', href: appRoutes.profile, route: 'profile' },
    ]
  }

  return [
    { label: 'Dashboard', href: appRoutes.dashboard, route: 'dashboard' },
    { label: 'Request Record', href: appRoutes.requestRecord, route: 'request-record' },
    { label: 'Records Queue', href: appRoutes.recordsQueue, route: 'records-queue' },
    { label: 'Report Problem', href: appRoutes.reportProblem, route: 'report-problem' },
    { label: 'Profile', href: appRoutes.profile, route: 'profile' },
  ]
}
