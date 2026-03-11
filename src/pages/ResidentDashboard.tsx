import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import { buildQuery, parseApiJson } from '../lib/api'
import { appRoutes } from '../lib/routes'
import { getWorkspaceNav } from '../navigation'

type RecordRequest = {
  request_id: string
  request_type: string
  status: string
  created_at: string
}

type CommunityReport = {
  report_id: string
  report_type: string
  status: string
  created_at: string
}

type Notification = {
  notification_id: string
  title: string
  message: string
  created_at: string
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function ResidentDashboardPage() {
  const { authenticatedFetch, user } = useAuth()
  const [requests, setRequests] = useState<RecordRequest[]>([])
  const [reports, setReports] = useState<CommunityReport[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [dateRange, setDateRange] = useState<'7' | '30' | '90'>('30')

  useEffect(() => {
    let active = true

    async function loadDashboard() {
      const dateFrom = new Date()
      dateFrom.setDate(dateFrom.getDate() - Number(dateRange))
      const formattedDate = dateFrom.toISOString().slice(0, 10)

      const [requestResponse, reportResponse, notificationResponse] = await Promise.all([
        authenticatedFetch(`/record-requests${buildQuery({ date_from: formattedDate })}`),
        authenticatedFetch('/community-reports'),
        authenticatedFetch('/notifications'),
      ])
      const requestData = await parseApiJson<RecordRequest[]>(requestResponse)
      const reportData = await parseApiJson<CommunityReport[]>(reportResponse)
      const notificationData = await parseApiJson<Notification[]>(notificationResponse)

      if (!active) {
        return
      }

      setRequests(requestResponse.ok && requestData ? requestData : [])
      setReports(reportResponse.ok && reportData ? reportData : [])
      setNotifications(notificationResponse.ok && notificationData ? notificationData : [])
    }

    void loadDashboard()

    return () => {
      active = false
    }
  }, [authenticatedFetch, dateRange])

  const metrics = useMemo(() => {
    const queueCount = requests.filter((item) => item.status === 'Pending' || item.status === 'In Progress').length
    const pickupCount = requests.filter((item) => item.status === 'Ready To Pickup').length
    const openReportCount = reports.filter((item) => item.status === 'Open' || item.status === 'In Review').length
    return { queueCount, pickupCount, openReportCount }
  }, [reports, requests])

  return (
    <DashboardLayout currentRoute="dashboard" navItems={getWorkspaceNav(user?.role)}>
      <div className="space-y-6">
        <header className="rounded-[1.75rem] border border-[#dbe4f0] bg-white/95 px-6 py-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)] lg:px-8 lg:py-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2f6df6]">Resident Workspace</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-[#111827]">
                Welcome, {user?.firstName ?? 'Resident'}
              </h1>
              <p className="mt-2 text-sm text-[#64748b]">
                Submit barangay record requests, monitor your queue, and report local problems from {user?.purok ?? 'your purok'}.
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

        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: 'Pending / In Progress', value: metrics.queueCount, accent: 'text-amber-700 bg-amber-50' },
            { label: 'Ready To Pickup', value: metrics.pickupCount, accent: 'text-emerald-700 bg-emerald-50' },
            { label: 'Open Problem Reports', value: metrics.openReportCount, accent: 'text-rose-700 bg-rose-50' },
          ].map((item) => (
            <article key={item.label} className="rounded-[1.5rem] border border-black/6 bg-white px-5 py-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
              <p className="text-sm text-[#64748b]">{item.label}</p>
              <div className={`mt-5 inline-flex rounded-2xl px-4 py-3 text-3xl font-semibold ${item.accent}`}>{item.value}</div>
            </article>
          ))}
        </div>

        <div className="grid gap-6 2xl:grid-cols-[1.15fr_0.95fr]">
          <section className="rounded-[1.75rem] border border-[#dbe4f0] bg-white/95 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between border-b border-black/6 px-6 py-5">
              <div>
                <h2 className="text-xl font-semibold text-[#111827]">Request Queue</h2>
                <p className="mt-1 text-sm text-[#64748b]">Track your recent barangay document requests.</p>
              </div>
              <Link to={appRoutes.recordsQueue} className="text-sm font-semibold text-[#2f6df6]">View All</Link>
            </div>
            <div className="space-y-3 px-6 py-5">
              {requests.slice(0, 4).map((request) => (
                <article key={request.request_id} className="rounded-2xl border border-[#dde6f3] bg-[#fbfdff] px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-[#111827]">{request.request_type}</p>
                      <p className="mt-1 text-sm text-[#64748b]">{request.request_id} • {formatDate(request.created_at)}</p>
                    </div>
                    <span className="rounded-full bg-[#eef4ff] px-3 py-1 text-xs font-semibold text-[#1d4ed8]">{request.status}</span>
                  </div>
                </article>
              ))}
              {requests.length === 0 ? <p className="text-sm text-[#64748b]">No requests submitted yet.</p> : null}
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-[#dbe4f0] bg-white/95 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between border-b border-black/6 px-6 py-5">
              <div>
                <h2 className="text-xl font-semibold text-[#111827]">Notifications</h2>
                <p className="mt-1 text-sm text-[#64748b]">Recent updates, especially pickup-ready requests.</p>
              </div>
              <Link to={appRoutes.recordsQueue} className="text-sm font-semibold text-[#2f6df6]">Open Queue</Link>
            </div>
            <div className="space-y-3 px-6 py-5">
              {notifications.map((notification) => (
                <article key={notification.notification_id} className="rounded-2xl border border-[#dde6f3] bg-[#fbfdff] px-4 py-4">
                  <p className="font-semibold text-[#111827]">{notification.title}</p>
                  <p className="mt-1 text-sm text-[#334155]">{notification.message}</p>
                  <p className="mt-2 text-xs text-[#94a3b8]">{formatDate(notification.created_at)}</p>
                </article>
              ))}
              {notifications.length === 0 ? <p className="text-sm text-[#64748b]">No notifications yet.</p> : null}
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  )
}

export default ResidentDashboardPage
