import { useEffect, useState } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import { buildQuery, downloadTextFile, parseApiJson, toCsv } from '../lib/api'
import { getWorkspaceNav } from '../navigation'

type ActivityLog = {
  log_id: string
  actor_email: string
  actor_role: string
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

function ActivityLogsPage() {
  const { authenticatedFetch, user } = useAuth()
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({
    search: '',
    actorEmail: '',
    targetCollection: '',
    dateFrom: '',
    dateTo: '',
  })

  useEffect(() => {
    let active = true

    async function loadLogs() {
      setLoading(true)
      setError('')

      const response = await authenticatedFetch(
        `/activity-logs${buildQuery({
          search: filters.search.trim(),
          actor_email: filters.actorEmail.trim(),
          target_collection: filters.targetCollection,
          date_from: filters.dateFrom,
          date_to: filters.dateTo,
        })}`,
      )
      const data = await parseApiJson<ActivityLog[]>(response)

      if (!active) {
        return
      }

      if (!response.ok || !data) {
        setError('Unable to load activity logs.')
        setLogs([])
      } else {
        setLogs(data)
      }

      setLoading(false)
    }

    void loadLogs()

    return () => {
      active = false
    }
  }, [authenticatedFetch, filters.actorEmail, filters.dateFrom, filters.dateTo, filters.search, filters.targetCollection])

  function exportLogs() {
    const csv = toCsv(
      logs.map((log) => ({
        Timestamp: formatDateTime(log.timestamp),
        Action: log.action,
        Actor: log.actor_email,
        Role: log.actor_role,
        Collection: log.target_collection,
        Target: log.target_id,
        Details: log.details,
      })),
    )
    downloadTextFile('recordwise-activity-logs.csv', csv, 'text/csv;charset=utf-8')
  }

  return (
    <DashboardLayout currentRoute="activity-logs" navItems={getWorkspaceNav(user?.role)}>
      <section className="rounded-[1.75rem] border border-black/6 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
        <div className="border-b border-black/6 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2f6df6]">Secretary Workspace</p>
          <h1 className="mt-2 text-3xl font-semibold text-[#111827]">Activity Logs</h1>
          <p className="mt-2 text-sm text-[#64748b]">Search, filter, and export system actions for requests, reports, and archived records.</p>
          <div className="mt-5 grid gap-3 lg:grid-cols-5">
            <input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Search action, detail, or target"
              className="rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3 text-sm outline-none"
            />
            <input
              value={filters.actorEmail}
              onChange={(event) => setFilters((current) => ({ ...current, actorEmail: event.target.value }))}
              placeholder="Actor email"
              className="rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3 text-sm outline-none"
            />
            <select
              value={filters.targetCollection}
              onChange={(event) => setFilters((current) => ({ ...current, targetCollection: event.target.value }))}
              className="rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3 text-sm outline-none"
            >
              <option value="">All collections</option>
              <option value="record_requests">Record Requests</option>
              <option value="community_reports">Community Reports</option>
              <option value="security_records">Security Records</option>
            </select>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
              className="rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3 text-sm outline-none"
            />
            <div className="flex gap-3">
              <input
                type="date"
                value={filters.dateTo}
                onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
                className="min-w-0 flex-1 rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3 text-sm outline-none"
              />
              <button
                type="button"
                onClick={exportLogs}
                disabled={logs.length === 0}
                className="rounded-2xl bg-[#111827] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                Export
              </button>
            </div>
          </div>
        </div>
        <div className="space-y-3 px-6 py-6">
          {loading ? <p className="text-sm text-[#64748b]">Loading activity logs...</p> : null}
          {error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
          {!loading && !error
            ? logs.map((log) => (
                <article key={log.log_id} className="rounded-2xl border border-[#dde6f3] bg-[#fbfdff] px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-[#111827]">{log.action}</p>
                      <p className="mt-1 text-sm text-[#64748b]">
                        {log.actor_email} ({log.actor_role}) • {formatDateTime(log.timestamp)}
                      </p>
                    </div>
                    <span className="rounded-full bg-[#eef4ff] px-3 py-1 text-xs font-semibold text-[#1d4ed8]">{log.target_collection}</span>
                  </div>
                  <p className="mt-3 text-sm text-[#334155]">{log.details}</p>
                  <p className="mt-2 text-xs text-[#94a3b8]">Target: {log.target_id}</p>
                </article>
              ))
            : null}
          {!loading && !error && logs.length === 0 ? <p className="text-sm text-[#64748b]">No activity logs match the current filters.</p> : null}
        </div>
      </section>
    </DashboardLayout>
  )
}

export default ActivityLogsPage
