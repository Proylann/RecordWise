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
        <div className="rounded-[1.75rem] border border-black/6 bg-[linear-gradient(135deg,#1d4ed8_0%,#0f172a_100%)] p-8 text-white shadow-[0_18px_48px_rgba(15,23,42,0.18)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Admin Workspace</p>
          <h1 className="mt-3 text-4xl font-semibold">RecordWise Control Panel</h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-200">Oversee resident accounts, staff access, requests, incidents, logs, activities, and archives from one administrative workspace.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {quickLinks.map((item) => (
              <Link key={item.href} to={item.href} className="rounded-2xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/16">
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ['Residents', summary?.residents ?? 0],
            ['Staff', summary?.staff ?? 0],
            ['Requests', summary?.requests ?? 0],
            ['Incidents', summary?.incidents ?? 0],
            ['Logs', summary?.logs ?? 0],
            ['Archives', summary?.archives ?? 0],
            ['Archived Users', summary?.archived_users ?? 0],
          ].map(([label, value]) => (
            <article key={label} className="rounded-[1.5rem] border border-[#d8e2f0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
              <p className="text-sm font-medium text-[#64748b]">{label}</p>
              <p className="mt-3 text-3xl font-semibold text-[#111827]">{value}</p>
            </article>
          ))}
        </div>
      </section>
    </DashboardLayout>
  )
}

export default AdminDashboardPage
