import { useEffect, useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import { useAuth } from '../../context/AuthContext'
import { API_BASE_URL, parseApiJson } from '../../lib/api'
import { getWorkspaceNav } from '../../navigation'

type Incident = {
  report_id: string
  report_type: string
  custom_concern?: string | null
  description: string
  urgency: string
  status: string
  resident_name: string
  purok: string
  created_at: string
  evidence_url?: string | null
}

const statuses = ['Open', 'In Review', 'Resolved', 'Declined']

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function AdminIncidentsPage() {
  const { authenticatedFetch, user } = useAuth()
  const [incidents, setIncidents] = useState<Incident[]>([])

  async function loadIncidents() {
    const response = await authenticatedFetch('/community-reports')
    const data = await parseApiJson<Incident[]>(response)
    setIncidents(response.ok && data ? data : [])
  }

  useEffect(() => {
    void loadIncidents()
  }, [])

  async function updateStatus(reportId: string, status: string) {
    const response = await authenticatedFetch(`/community-reports/${reportId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, notes: `Updated by ${user?.email}` }),
    })
    if (response.ok) {
      void loadIncidents()
    }
  }

  async function deleteIncident(reportId: string) {
    const shouldDelete = window.confirm(`Are you sure you want to delete incident report ${reportId}?`)
    if (!shouldDelete) {
      return
    }
    const response = await authenticatedFetch(`/admin/community-reports/${reportId}`, { method: 'DELETE' })
    if (response.ok) {
      void loadIncidents()
    }
  }

  return (
    <DashboardLayout currentRoute="admin-incidents" navItems={getWorkspaceNav(user?.role)}>
      <section className="rounded-[1.75rem] border border-black/6 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
        <div className="border-b border-black/6 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2f6df6]">Admin Workspace</p>
          <h1 className="mt-2 text-3xl font-semibold text-[#111827]">Incidents</h1>
          <p className="mt-2 text-sm text-[#64748b]">Review, update, and delete resident incident reports.</p>
        </div>
        <div className="space-y-3 px-6 py-6">
          {incidents.map((incident) => (
            <article key={incident.report_id} className="rounded-2xl border border-[#dde6f3] bg-[#fbfdff] p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-[#111827]">
                    {incident.report_type === 'Other' ? incident.custom_concern ?? 'Other' : incident.report_type}
                  </p>
                  <p className="mt-1 text-sm text-[#64748b]">
                    {incident.resident_name} • {incident.purok} • {formatDate(incident.created_at)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className="rounded-full bg-[#fff1f2] px-3 py-1 text-xs font-semibold text-[#be123c]">{incident.urgency}</span>
                  <span className="rounded-full bg-[#eef4ff] px-3 py-1 text-xs font-semibold text-[#1d4ed8]">{incident.status}</span>
                </div>
              </div>
              <p className="mt-3 text-sm text-[#334155]">{incident.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {statuses.map((status) => (
                  <button key={status} type="button" onClick={() => void updateStatus(incident.report_id, status)} className="rounded-xl border border-[#d8deea] bg-white px-3 py-2 text-xs font-semibold text-[#334155]">
                    {status}
                  </button>
                ))}
                {incident.evidence_url ? (
                  <a href={`${API_BASE_URL}${incident.evidence_url}`} target="_blank" rel="noreferrer" className="rounded-xl border border-[#d8deea] bg-white px-3 py-2 text-xs font-semibold text-[#334155]">
                    Evidence
                  </a>
                ) : null}
                <button type="button" onClick={() => void deleteIncident(incident.report_id)} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white">
                  Delete
                </button>
              </div>
            </article>
          ))}
          {incidents.length === 0 ? <p className="text-sm text-[#64748b]">No incidents found.</p> : null}
        </div>
      </section>
    </DashboardLayout>
  )
}

export default AdminIncidentsPage
