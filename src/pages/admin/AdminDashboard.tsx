import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import DashboardLayout from '../../components/DashboardLayout'
import { useAuth } from '../../context/AuthContext'
import { parseApiJson } from '../../lib/api'
import { appRoutes } from '../../lib/routes'
import { getWorkspaceNav } from '../../navigation'

type Summary = {
  residents: number
  staff: number
  requests: number
  incidents: number
  logs: number
  archives: number
  archived_users: number
}

const quickLinks = [
  { label: 'Residents', href: appRoutes.adminResidents },
  { label: 'Staff', href: appRoutes.adminStaff },
  { label: 'Requests', href: appRoutes.adminRequests },
  { label: 'Incidents', href: appRoutes.adminIncidents },
  { label: 'Logs', href: appRoutes.adminLogs },
  { label: 'Activities', href: appRoutes.adminActivities },
  { label: 'Archives', href: appRoutes.adminArchives },
]

function AdminDashboardPage() {
  const { authenticatedFetch, user } = useAuth()
  const [summary, setSummary] = useState<Summary | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      const response = await authenticatedFetch('/admin/summary')
      const data = await parseApiJson<Summary>(response)
      if (active && response.ok && data) setSummary(data)
    })()
    return () => {
      active = false
    }
  }, [authenticatedFetch])

  return (
    <DashboardLayout currentRoute="dashboard" navItems={getWorkspaceNav(user?.role)}>
      <section className="space-y-6">
        <div className="rounded-[1.9rem] border border-black/6 bg-[linear-gradient(135deg,#1d4ed8_0%,#172554_58%,#0f172a_100%)] p-8 text-white shadow-[0_22px_56px_rgba(15,23,42,0.2)] lg:p-10">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Admin Workspace</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">RecordWise Control Panel</h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-200 sm:text-base">
                Oversee resident accounts, staff access, requests, incidents, logs, activities, and archives from one administrative workspace.
              </p>
            </div>

            <div className="grid max-w-md grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                ['Residents', summary?.residents ?? 0],
                ['Staff', summary?.staff ?? 0],
                ['Requests', summary?.requests ?? 0],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/15 bg-white/10 px-4 py-4 backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/65">{label}</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            {quickLinks.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="rounded-2xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/16"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            ['Residents', summary?.residents ?? 0, 'Registered accounts in the resident workspace.'],
            ['Staff', summary?.staff ?? 0, 'Active administrative and staff access.'],
            ['Requests', summary?.requests ?? 0, 'Document requests currently stored in the system.'],
            ['Incidents', summary?.incidents ?? 0, 'Incident and report entries tracked by the barangay.'],
            ['Logs', summary?.logs ?? 0, 'System activity and operational log entries.'],
            ['Archives', summary?.archives ?? 0, 'Archived records across all managed workflows.'],
            ['Archived Users', summary?.archived_users ?? 0, 'Accounts removed from active workspace access.'],
          ].map(([label, value, description]) => (
            <article
              key={label}
              className="rounded-[1.5rem] border border-[#d8e2f0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]"
            >
              <p className="text-sm font-medium text-[#64748b]">{label}</p>
              <p className="mt-3 text-3xl font-semibold text-[#111827]">{value}</p>
              <p className="mt-2 text-sm leading-6 text-[#64748b]">{description}</p>
            </article>
          ))}
        </div>
      </section>
    </DashboardLayout>
  )
}

export default AdminDashboardPage
