import { useEffect, useState } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import { parseApiJson } from '../lib/api'
import { getWorkspaceNav } from '../navigation'

type StatusTimelineEntry = {
  status: string
  timestamp: string
  actor_email: string
  notes?: string | null
}

type RecordRequest = {
  request_id: string
  request_type: string
  purpose: string
  status: string
  updated_at: string
  status_history: StatusTimelineEntry[]
}

type Notification = {
  notification_id: string
  title: string
  message: string
  created_at: string
}

function normalizeStatus(status: string) {
  if (status === 'On Process') {
    return 'In Progress'
  }
  if (status === 'Ready to Pickup') {
    return 'Ready To Pickup'
  }
  return status
}

function getStatusBadgeClass(status: string) {
  const normalized = normalizeStatus(status)
  if (normalized === 'Pending') return 'bg-amber-100 text-amber-800'
  if (normalized === 'In Progress') return 'bg-blue-100 text-blue-800'
  if (normalized === 'Ready To Pickup') return 'bg-emerald-100 text-emerald-800'
  if (normalized === 'Claimed') return 'bg-slate-200 text-slate-800'
  if (normalized === 'Declined') return 'bg-rose-100 text-rose-800'
  return 'bg-[#eef4ff] text-[#1d4ed8]'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function RecordsQueuePage() {
  const { authenticatedFetch, user } = useAuth()
  const [requests, setRequests] = useState<RecordRequest[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function loadData() {
      const [requestsResponse, notificationsResponse] = await Promise.all([
        authenticatedFetch('/record-requests'),
        authenticatedFetch('/notifications'),
      ])

      const requestsData = await parseApiJson<RecordRequest[]>(requestsResponse)
      const notificationsData = await parseApiJson<Notification[]>(notificationsResponse)

      if (!active) {
        return
      }

      setRequests(requestsResponse.ok && requestsData ? requestsData : [])
      setNotifications(notificationsResponse.ok && notificationsData ? notificationsData : [])
      setLoading(false)
    }

    void loadData()

    return () => {
      active = false
    }
  }, [authenticatedFetch])

  return (
    <DashboardLayout currentRoute="records-queue" navItems={getWorkspaceNav(user?.role)}>
      <div className="space-y-6">
        <section className="rounded-[1.75rem] border border-black/6 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
          <div className="border-b border-black/6 px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2f6df6]">Resident Services</p>
            <h1 className="mt-2 text-3xl font-semibold text-[#111827]">Records Queue</h1>
            <p className="mt-2 text-sm text-[#64748b]">Track request progress with a clear status timeline and pickup alerts.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr className="bg-[#f8fafc] text-left">
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Request ID</th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Type</th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Purpose</th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Updated</th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Status</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.request_id} className="align-top text-sm text-[#334155]">
                    <td className="border-t border-black/6 px-6 py-4 font-semibold text-[#111827]">{request.request_id}</td>
                    <td className="border-t border-black/6 px-6 py-4">{request.request_type}</td>
                    <td className="border-t border-black/6 px-6 py-4">{request.purpose}</td>
                    <td className="border-t border-black/6 px-6 py-4">{formatDate(request.updated_at)}</td>
                    <td className="border-t border-black/6 px-6 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(request.status)}`}>
                        {normalizeStatus(request.status)}
                      </span>
                      {request.status_history.length > 0 ? (
                        <p className="mt-3 text-[11px] text-[#64748b]">
                          Last update: {formatDateTime(request.status_history[request.status_history.length - 1].timestamp)}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {!loading && requests.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-sm text-[#64748b]">No record requests found.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-black/6 bg-white px-6 py-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
          <h2 className="text-xl font-semibold text-[#111827]">Notifications</h2>
          <div className="mt-4 space-y-3">
            {notifications.map((notification) => (
              <article key={notification.notification_id} className="rounded-2xl border border-[#dbe3f0] bg-[#f8fbff] px-4 py-4">
                <p className="font-semibold text-[#111827]">{notification.title}</p>
                <p className="mt-1 text-sm text-[#334155]">{notification.message}</p>
                <p className="mt-2 text-xs text-[#94a3b8]">{formatDateTime(notification.created_at)}</p>
              </article>
            ))}
            {notifications.length === 0 ? <p className="text-sm text-[#64748b]">No notifications yet.</p> : null}
          </div>
        </section>
      </div>
    </DashboardLayout>
  )
}

export default RecordsQueuePage
