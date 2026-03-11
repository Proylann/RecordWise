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
  purpose: string
  status: string
  resident_name: string
  purok: string
  submitted_by: string
  created_at: string
  updated_at: string
  assigned_secretary_email?: string | null
}

const requestTypeFilters = [
  'All Requests',
  'Barangay Clearance',
  'Certificate of Indigency',
  'Certificate of Residency',
  'Business Clearance',
]

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function SecretaryRequestsPage() {
  const { authenticatedFetch, user } = useAuth()
  const [requests, setRequests] = useState<RecordRequest[]>([])
  const [activeFilter, setActiveFilter] = useState('All Requests')
  const [search, setSearch] = useState('')
  const [showMineOnly, setShowMineOnly] = useState(false)

  useEffect(() => {
    let active = true

    async function loadRequests() {
      const response = await authenticatedFetch(
        `/record-requests${buildQuery({
          search: search.trim(),
          assigned_to_me: showMineOnly,
        })}`,
      )
      const data = await parseApiJson<RecordRequest[]>(response)
      if (!active) {
        return
      }
      setRequests(response.ok && data ? data : [])
    }

    void loadRequests()

    return () => {
      active = false
    }
  }, [authenticatedFetch, search, showMineOnly])

  async function assignToMe(requestId: string) {
    const response = await authenticatedFetch(`/record-requests/${requestId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'In Progress',
        notes: `Assigned to ${user?.email}`,
        assigned_secretary_email: user?.email,
      }),
    })
    const data = await parseApiJson<RecordRequest>(response)
    if (response.ok && data) {
      setRequests((current) => current.map((request) => (request.request_id === data.request_id ? data : request)))
    }
  }

  const filteredRequests = useMemo(() => {
    const activeRequests = requests.filter((request) => request.status === 'Pending' || request.status === 'In Progress')
    if (activeFilter === 'All Requests') {
      return activeRequests
    }
    return activeRequests.filter((request) => request.request_type === activeFilter)
  }, [activeFilter, requests])

  return (
    <DashboardLayout currentRoute="secretary-requests" navItems={getWorkspaceNav(user?.role)}>
      <section className="rounded-[1.75rem] border border-black/6 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
        <div className="border-b border-black/6 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2f6df6]">Secretary Workspace</p>
          <h1 className="mt-2 text-3xl font-semibold text-[#111827]">Request Section</h1>
          <p className="mt-2 text-sm text-[#64748b]">
            Review resident requests, assign ownership, and move each document through the processing workflow.
          </p>
          <div className="mt-5 grid gap-3 lg:grid-cols-[1.2fr_auto]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search resident, request, or secretary"
              className="rounded-2xl border border-[#d8deea] bg-white px-4 py-3 text-sm outline-none"
            />
            <label className="flex items-center gap-3 rounded-2xl border border-[#d8deea] bg-[#f8fbff] px-4 py-3 text-sm font-medium text-[#334155]">
              <input type="checkbox" checked={showMineOnly} onChange={(event) => setShowMineOnly(event.target.checked)} />
              My assigned requests only
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {requestTypeFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeFilter === filter
                    ? 'bg-[#2f6df6] text-white'
                    : 'border border-[#d8deea] bg-white text-[#475569] hover:border-[#2f6df6] hover:text-[#1d4ed8]'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0">
            <thead>
              <tr className="bg-[#f8fafc] text-left">
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Request ID</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Resident Name</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Request Type</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Purok</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Assigned</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Date Requested</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Status</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((request) => (
                <tr key={request.request_id} className="text-sm text-[#334155]">
                  <td className="border-t border-black/6 px-6 py-4 font-semibold text-[#111827]">{request.request_id}</td>
                  <td className="border-t border-black/6 px-6 py-4">
                    <div>
                      <p className="font-semibold text-[#111827]">{request.resident_name}</p>
                      <p className="mt-1 text-xs text-[#94a3b8]">{request.submitted_by}</p>
                    </div>
                  </td>
                  <td className="border-t border-black/6 px-6 py-4">{request.request_type}</td>
                  <td className="border-t border-black/6 px-6 py-4">{request.purok}</td>
                  <td className="border-t border-black/6 px-6 py-4">{request.assigned_secretary_email ?? 'Unassigned'}</td>
                  <td className="border-t border-black/6 px-6 py-4">{formatDate(request.created_at)}</td>
                  <td className="border-t border-black/6 px-6 py-4">
                    <span className="rounded-full bg-[#eef4ff] px-3 py-1 text-xs font-semibold text-[#1d4ed8]">
                      {request.status}
                    </span>
                  </td>
                  <td className="border-t border-black/6 px-6 py-4">
                    <div className="flex flex-wrap gap-2">
                      {!request.assigned_secretary_email ? (
                        <button
                          type="button"
                          onClick={() => void assignToMe(request.request_id)}
                          className="inline-flex rounded-xl border border-[#d8deea] bg-white px-4 py-2 text-xs font-semibold text-[#111827]"
                        >
                          Assign to me
                        </button>
                      ) : null}
                      <Link
                        to={`${appRoutes.processRequest}?request_id=${encodeURIComponent(request.request_id)}`}
                        className="inline-flex rounded-xl bg-[#111827] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#1f2937]"
                      >
                        Process
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-sm text-[#64748b]">
                    No active requests found for this category.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </DashboardLayout>
  )
}

export default SecretaryRequestsPage
