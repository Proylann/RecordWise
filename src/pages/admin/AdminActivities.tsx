import { useEffect, useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import { useAuth } from '../../context/AuthContext'
import { parseApiJson } from '../../lib/api'
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

type ActivityLog = {
  log_id: string
  actor_email: string
  action: string
  details: string
  timestamp: string
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function AdminActivitiesPage() {
  const { authenticatedFetch, user } = useAuth()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [logs, setLogs] = useState<ActivityLog[]>([])

  useEffect(() => {
    let active = true

    void (async () => {
      const [summaryResponse, logsResponse] = await Promise.all([
        authenticatedFetch('/admin/summary'),
        authenticatedFetch('/activity-logs'),
      ])
      const summaryData = await parseApiJson<Summary>(summaryResponse)
      const logsData = await parseApiJson<ActivityLog[]>(logsResponse)

      if (!active) {
        return
      }

      if (summaryResponse.ok && summaryData) {
        setSummary(summaryData)
      }
      if (logsResponse.ok && logsData) {
        setLogs(logsData.slice(0, 12))
      }
    })()

    return () => {
      active = false
    }
  }, [authenticatedFetch])

  return (
    <DashboardLayout currentRoute="admin-activities" navItems={getWorkspaceNav(user?.role)}>
      <section className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            ['Resident Accounts', summary?.residents ?? 0],
            ['Operational Records', (summary?.requests ?? 0) + (summary?.incidents ?? 0)],
            ['Archived Accounts', summary?.archived_users ?? 0],
          ].map(([label, value]) => (
            <article key={label} className="rounded-[1.5rem] border border-[#d8e2f0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
              <p className="text-sm text-[#64748b]">{label}</p>
              <p className="mt-3 text-3xl font-semibold text-[#111827]">{value}</p>
            </article>
          ))}
        </div>

        <section className="rounded-[1.75rem] border border-black/6 bg-white px-6 py-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2f6df6]">Activities</p>
          <h1 className="mt-2 text-3xl font-semibold text-[#111827]">Recent System Activity</h1>
          <div className="mt-6 space-y-3">
            {logs.map((log) => (
              <article key={log.log_id} className="rounded-2xl border border-[#dde6f3] bg-[#fbfdff] px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-[#111827]">{log.action}</p>
                    <p className="mt-1 text-sm text-[#64748b]">{log.details}</p>
                  </div>
                  <div className="text-right text-xs text-[#94a3b8]">
                    <p>{log.actor_email}</p>
                    <p>{formatDateTime(log.timestamp)}</p>
                  </div>
                </div>
              </article>
            ))}
            {logs.length === 0 ? <p className="text-sm text-[#64748b]">No recent activity found.</p> : null}
          </div>
        </section>
      </section>
    </DashboardLayout>
  )
}

export default AdminActivitiesPage
