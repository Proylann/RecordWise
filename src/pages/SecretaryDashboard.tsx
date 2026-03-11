import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import { buildQuery, parseApiJson } from '../lib/api'
import { appRoutes } from '../lib/routes'
import { getWorkspaceNav } from '../navigation'

type RecordRequest = { status: string; assigned_secretary_email?: string | null }
type CommunityReport = { status: string; urgency?: string }
type ArchiveRecord = { source_type?: string | null }
type Notification = { notification_id: string; title: string; message: string; created_at: string }

type ChartItem = {
  label: string
  value: number
  color: string
}

function StackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 3 8l9 5 9-5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.72 3h16.92a2 2 0 0 0 1.72-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    </svg>
  )
}

function ArchiveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 11h6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 3h6a2 2 0 0 1 2 2v2H7V5a2 2 0 0 1 2-2Z" />
    </svg>
  )
}

function buildSummary(items: ChartItem[]) {
  return items.reduce((total, item) => total + item.value, 0)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value))
}

function SecretaryDashboardPage() {
  const { authenticatedFetch, user } = useAuth()
  const [requests, setRequests] = useState<RecordRequest[]>([])
  const [reports, setReports] = useState<CommunityReport[]>([])
  const [records, setRecords] = useState<ArchiveRecord[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [dateRange, setDateRange] = useState<'7' | '30' | '90'>('30')

  useEffect(() => {
    let active = true

    async function loadDashboard() {
      const dateFrom = new Date()
      dateFrom.setDate(dateFrom.getDate() - Number(dateRange))
      const formattedDate = dateFrom.toISOString().slice(0, 10)

      const [requestResponse, reportResponse, recordResponse, notificationResponse] = await Promise.all([
        authenticatedFetch(`/record-requests${buildQuery({ date_from: formattedDate })}`),
        authenticatedFetch('/community-reports'),
        authenticatedFetch(`/security-records${buildQuery({ date_from: formattedDate })}`),
        authenticatedFetch('/notifications'),
      ])
      const requestData = await parseApiJson<RecordRequest[]>(requestResponse)
      const reportData = await parseApiJson<CommunityReport[]>(reportResponse)
      const recordData = await parseApiJson<{ records: ArchiveRecord[] }>(recordResponse)
      const notificationData = await parseApiJson<Notification[]>(notificationResponse)

      if (!active) {
        return
      }

      setRequests(requestResponse.ok && requestData ? requestData : [])
      setReports(reportResponse.ok && reportData ? reportData : [])
      setRecords(recordResponse.ok && recordData ? recordData.records : [])
      setNotifications(notificationResponse.ok && notificationData ? notificationData : [])
    }

    void loadDashboard()

    return () => {
      active = false
    }
  }, [authenticatedFetch, dateRange])

  const requestChart = useMemo(
    () => [
      { label: 'Pending', value: requests.filter((item) => item.status === 'Pending').length, color: 'bg-amber-400' },
      { label: 'In Progress', value: requests.filter((item) => item.status === 'In Progress').length, color: 'bg-blue-500' },
      { label: 'Assigned', value: requests.filter((item) => Boolean(item.assigned_secretary_email)).length, color: 'bg-violet-500' },
      { label: 'Ready / Claimed', value: requests.filter((item) => item.status === 'Ready To Pickup' || item.status === 'Claimed').length, color: 'bg-emerald-500' },
    ],
    [requests],
  )

  const reportChart = useMemo(
    () => [
      { label: 'Urgent', value: reports.filter((item) => item.urgency === 'Urgent').length, color: 'bg-rose-500' },
      { label: 'High', value: reports.filter((item) => item.urgency === 'High').length, color: 'bg-orange-500' },
      { label: 'Medium', value: reports.filter((item) => item.urgency === 'Medium').length, color: 'bg-yellow-400' },
      { label: 'Low', value: reports.filter((item) => item.urgency === 'Low').length, color: 'bg-emerald-400' },
    ],
    [reports],
  )

  const archiveChart = useMemo(
    () => [
      { label: 'Requests', value: records.filter((item) => item.source_type === 'record_request').length, color: 'bg-sky-500' },
      { label: 'Incidents', value: records.filter((item) => item.source_type === 'community_report').length, color: 'bg-fuchsia-500' },
      { label: 'Manual Uploads', value: records.filter((item) => !item.source_type).length, color: 'bg-slate-500' },
    ],
    [records],
  )

  const maxValue = Math.max(
    1,
    ...requestChart.map((item) => item.value),
    ...reportChart.map((item) => item.value),
    ...archiveChart.map((item) => item.value),
  )

  const summaryCards = [
    {
      title: 'Request Status',
      total: buildSummary(requestChart),
      caption: 'Document request workload in the selected date range',
      icon: <StackIcon />,
      accent: 'from-[#e8f1ff] to-[#f8fbff] text-[#2f6df6]',
      items: requestChart,
    },
    {
      title: 'Incident Urgency',
      total: buildSummary(reportChart),
      caption: 'Incident severity counts reflected in the graph',
      icon: <AlertIcon />,
      accent: 'from-[#fff1f2] to-[#fffaf5] text-[#e11d48]',
      items: reportChart,
    },
    {
      title: 'Archive Sources',
      total: buildSummary(archiveChart),
      caption: 'Archived record sources represented in the graph',
      icon: <ArchiveIcon />,
      accent: 'from-[#eefaf5] to-[#f8fbff] text-[#0f766e]',
      items: archiveChart,
    },
  ]

  return (
    <DashboardLayout currentRoute="dashboard" navItems={getWorkspaceNav(user?.role)}>
      <div className="space-y-8">
        <header className="rounded-[1.75rem] border border-[#dbe4f0] bg-white/95 px-6 py-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)] lg:px-8 lg:py-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2f6df6]">Secretary Dashboard</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-[#111827]">Operations Analytics</h1>
              <p className="mt-2 text-sm text-[#64748b]">
                A clearer view of request volume, incident urgency, archive distribution, and pending ownership.
              </p>
            </div>
            <select
              value={dateRange}
              onChange={(event) => setDateRange(event.target.value as '7' | '30' | '90')}
              className="rounded-2xl border border-[#d8deea] bg-white px-4 py-3 text-sm outline-none"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </div>
        </header>

        <section className="grid gap-5 xl:grid-cols-3">
          {summaryCards.map((card) => (
            <article
              key={card.title}
              className={`rounded-[1.75rem] border border-[#dbe4f0] bg-gradient-to-br ${card.accent} px-6 py-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)]`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-current/80">{card.title}</p>
                  <p className="mt-3 text-4xl font-semibold text-[#111827]">{card.total}</p>
                  <p className="mt-2 text-sm text-[#4b5563]">{card.caption}</p>
                </div>
                <span className="rounded-2xl bg-white/80 p-3 shadow-sm">{card.icon}</span>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {card.items.map((item) => (
                  <span key={item.label} className="rounded-full bg-white/85 px-3 py-1.5 text-xs font-medium text-[#334155]">
                    {item.label}: {item.value}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
          <div className="grid gap-6 xl:grid-cols-3">
            {[
              { title: 'Request Status', items: requestChart },
              { title: 'Incident Urgency', items: reportChart },
              { title: 'Archive Sources', items: archiveChart },
            ].map((chart) => (
              <section
                key={chart.title}
                className="rounded-[1.75rem] border border-black/6 bg-white px-5 py-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-[#111827]">{chart.title}</h2>
                  <span className="rounded-full bg-[#f3f6fb] px-3 py-1 text-xs font-semibold text-[#475569]">
                    Total {buildSummary(chart.items)}
                  </span>
                </div>
                <div className="mt-8 flex h-56 items-end gap-4">
                  {chart.items.map((item) => (
                    <div key={item.label} className="flex flex-1 flex-col items-center gap-3">
                      <span className="text-sm font-semibold text-[#111827]">{item.value}</span>
                      <div className="flex h-40 w-full items-end rounded-[1.4rem] bg-[#f3f6fb] p-2">
                        <div
                          className={`w-full rounded-[1rem] ${item.color}`}
                          style={{ height: `${Math.max((item.value / maxValue) * 100, item.value > 0 ? 12 : 0)}%` }}
                        />
                      </div>
                      <span className="text-center text-xs font-medium text-[#64748b]">{item.label}</span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <section className="rounded-[1.75rem] border border-black/6 bg-white px-5 py-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[#111827]">Operational Alerts</h2>
                <p className="mt-1 text-sm text-[#64748b]">Requests that still need ownership or follow-up.</p>
              </div>
              <Link to={appRoutes.secretaryRequests} className="text-sm font-semibold text-[#2f6df6]">Open Requests</Link>
            </div>
            <div className="mt-5 space-y-3">
              {notifications.map((notification) => (
                <article key={notification.notification_id} className="rounded-2xl border border-[#dbe3f0] bg-[#f8fbff] px-4 py-4">
                  <p className="font-semibold text-[#111827]">{notification.title}</p>
                  <p className="mt-1 text-sm text-[#334155]">{notification.message}</p>
                  <p className="mt-2 text-xs text-[#94a3b8]">{formatDate(notification.created_at)}</p>
                </article>
              ))}
              {notifications.length === 0 ? <p className="text-sm text-[#64748b]">No operational alerts right now.</p> : null}
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  )
}

export default SecretaryDashboardPage
