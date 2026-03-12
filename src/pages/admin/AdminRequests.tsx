import { useEffect, useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import { useAuth } from '../../context/AuthContext'
import { buildQuery, parseApiJson } from '../../lib/api'
import { getWorkspaceNav } from '../../navigation'

type RecordRequest = {
  request_id: string
  request_type: string
  purpose: string
  status: string
  resident_name: string
  purok: string
  submitted_by: string
  created_at: string
}

const requestStatuses = ['Pending', 'In Progress', 'Ready To Pickup', 'Declined']

function getStatusButtonClasses(status: string) {
  if (status === 'Pending') {
    return 'bg-amber-100 text-amber-800 ring-1 ring-amber-200'
  }
  if (status === 'In Progress') {
    return 'bg-blue-100 text-blue-800 ring-1 ring-blue-200'
  }
  if (status === 'Ready To Pickup') {
    return 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200'
  }
  if (status === 'Declined') {
    return 'bg-rose-100 text-rose-800 ring-1 ring-rose-200'
  }
  return 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
}

function getStatusBadgeClasses(status: string) {
  if (status === 'Pending') return 'bg-amber-100 text-amber-800'
  if (status === 'In Progress') return 'bg-blue-100 text-blue-800'
  if (status === 'Ready To Pickup') return 'bg-emerald-100 text-emerald-800'
  if (status === 'Claimed') return 'bg-emerald-100 text-emerald-800'
  if (status === 'Declined') return 'bg-rose-100 text-rose-800'
  return 'bg-slate-100 text-slate-700'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function AdminRequestsPage() {
  const { authenticatedFetch, user } = useAuth()
  const [requests, setRequests] = useState<RecordRequest[]>([])
  const [search, setSearch] = useState('')

  async function loadRequests() {
    const response = await authenticatedFetch(`/record-requests${buildQuery({ search: search.trim() })}`)
    const data = await parseApiJson<RecordRequest[]>(response)
    setRequests(response.ok && data ? data : [])
  }

  useEffect(() => {
    void loadRequests()
  }, [search])

  async function updateStatus(requestId: string, status: string) {
    const response = await authenticatedFetch(`/record-requests/${requestId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        assigned_secretary_email: user?.email,
        notes: `Updated by ${user?.email}`,
      }),
    })

    if (response.ok) {
      void loadRequests()
    }
  }

  async function deleteRequest(requestId: string) {
    const shouldDelete = window.confirm(`Are you sure you want to delete request ${requestId}?`)
    if (!shouldDelete) {
      return
    }
    const response = await authenticatedFetch(`/admin/record-requests/${requestId}`, { method: 'DELETE' })
    if (response.ok) {
      void loadRequests()
    }
  }

  return (
    <DashboardLayout currentRoute="admin-requests" navItems={getWorkspaceNav(user?.role)}>
      <section className="rounded-[1.75rem] border border-black/6 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
        <div className="border-b border-black/6 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2f6df6]">Admin Workspace</p>
          <h1 className="mt-2 text-3xl font-semibold text-[#111827]">Requests</h1>
          <p className="mt-2 text-sm text-[#64748b]">Manage resident document requests with full administrative control.</p>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search requests"
            className="mt-5 w-full rounded-2xl border border-[#d8deea] bg-white px-4 py-3 text-sm outline-none"
          />
        </div>
        <div className="space-y-3 px-6 py-6">
          {requests.map((request) => (
            <article key={request.request_id} className="rounded-2xl border border-[#dde6f3] bg-[#fbfdff] p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-[#111827]">{request.request_type}</p>
                  <p className="mt-1 text-sm text-[#64748b]">
                    {request.resident_name} • {request.purok} • {formatDate(request.created_at)}
                  </p>
                  <p className="mt-3 text-sm text-[#334155]">{request.purpose}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadgeClasses(request.status)}`}>{request.status}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {requestStatuses.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => void updateStatus(request.request_id, status)}
                    className={`interactive-button rounded-xl px-3 py-2 text-xs font-semibold ${getStatusButtonClasses(status)}`}
                  >
                    {status}
                  </button>
                ))}
                <button type="button" onClick={() => void deleteRequest(request.request_id)} className="interactive-button rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700">
                  Delete
                </button>
              </div>
            </article>
          ))}
          {requests.length === 0 ? <p className="text-sm text-[#64748b]">No requests found.</p> : null}
        </div>
      </section>
    </DashboardLayout>
  )
}

export default AdminRequestsPage
