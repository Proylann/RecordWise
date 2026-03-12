import { useEffect, useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import { useAuth } from '../../context/AuthContext'
import { buildQuery, downloadTextFile, parseApiJson, toCsv } from '../../lib/api'
import { getWorkspaceNav } from '../../navigation'

type ActivityLog = {
  log_id: string
  actor_email: string
  action: string
  target_collection: string
  target_id: string
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

function AdminLogsPage() {
  const { authenticatedFetch, user } = useAuth()
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [search, setSearch] = useState('')

  async function loadLogs() {
    const response = await authenticatedFetch(`/activity-logs${buildQuery({ search: search.trim() })}`)
    const data = await parseApiJson<ActivityLog[]>(response)
    setLogs(response.ok && data ? data : [])
  }

  useEffect(() => {
    void loadLogs()
  }, [search])

  async function deleteLog(logId: string) {
    const shouldDelete = window.confirm(`Are you sure you want to delete log ${logId}?`)
    if (!shouldDelete) {
      return
    }
    const response = await authenticatedFetch(`/admin/activity-logs/${logId}`, { method: 'DELETE' })
    if (response.ok) {
      void loadLogs()
    }
  }

  function exportLogs() {
    const csv = toCsv(
      logs.map((log) => ({
        Timestamp: formatDateTime(log.timestamp),
        Actor: log.actor_email,
        Action: log.action,
        Collection: log.target_collection,
        Target: log.target_id,
        Details: log.details,
      })),
    )
    downloadTextFile('recordwise-admin-logs.csv', csv, 'text/csv;charset=utf-8')
  }

  return (
    <DashboardLayout currentRoute="admin-logs" navItems={getWorkspaceNav(user?.role)}>
      <section className="rounded-[1.75rem] border border-black/6 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
        <div className="border-b border-black/6 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2f6df6]">Admin Workspace</p>
          <h1 className="mt-2 text-3xl font-semibold text-[#111827]">Logs</h1>
          <div className="mt-5 flex flex-col gap-3 md:flex-row">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search logs"
              className="flex-1 rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3 text-sm outline-none"
            />
            <button type="button" onClick={exportLogs} disabled={logs.length === 0} className="rounded-2xl bg-[#111827] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
              Export
            </button>
          </div>
        </div>
        <div className="space-y-3 px-6 py-6">
          {logs.map((log) => (
            <article key={log.log_id} className="rounded-2xl border border-[#dde6f3] bg-[#fbfdff] px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-[#111827]">{log.action}</p>
                  <p className="mt-1 text-sm text-[#64748b]">{log.actor_email} • {formatDateTime(log.timestamp)}</p>
                  <p className="mt-2 text-sm text-[#334155]">{log.details}</p>
                  <p className="mt-2 text-xs text-[#94a3b8]">
                    {log.target_collection} • {log.target_id}
                  </p>
                </div>
                <button type="button" onClick={() => void deleteLog(log.log_id)} className="rounded-xl bg-[#111827] px-3 py-2 text-xs font-semibold text-white">
                  Delete
                </button>
              </div>
            </article>
          ))}
          {logs.length === 0 ? <p className="text-sm text-[#64748b]">No logs found.</p> : null}
        </div>
      </section>
    </DashboardLayout>
  )
}

export default AdminLogsPage
