import { useEffect, useMemo, useState } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import { API_BASE_URL, parseApiJson } from '../lib/api'
import { getWorkspaceNav } from '../navigation'

type CommunityReport = {
  report_id: string
  report_type: string
  custom_concern?: string | null
  description: string
  urgency: string
  status: string
  resident_name: string
  purok: string
  created_at: string
  evidence_filename?: string | null
  evidence_url?: string | null
}

const reportStatuses = ['In Review', 'Resolved', 'Declined']
const urgencyOrder: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 }

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function SecretaryReportsPage() {
  const { authenticatedFetch, user } = useAuth()
  const [reports, setReports] = useState<CommunityReport[]>([])
  const [typeFilter, setTypeFilter] = useState('')
  const [urgencyFilter, setUrgencyFilter] = useState('')

  async function loadReports() {
    const response = await authenticatedFetch('/community-reports')
    const data = await parseApiJson<CommunityReport[]>(response)
    if (response.ok) {
      setReports(data ?? [])
    }
  }

  useEffect(() => {
    let active = true

    void (async () => {
      const response = await authenticatedFetch('/community-reports')
      const data = await parseApiJson<CommunityReport[]>(response)
      if (active && response.ok) {
        setReports(data ?? [])
      }
    })()

    return () => {
      active = false
    }
  }, [authenticatedFetch])

  async function updateReport(reportId: string, status: string) {
    const response = await authenticatedFetch(`/community-reports/${reportId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, notes: `Updated by ${user?.email}` }),
    })
    if (response.ok) {
      void loadReports()
    }
  }

  const availableTypes = useMemo(
    () => Array.from(new Set(reports.map((report) => (report.report_type === 'Other' ? report.custom_concern ?? 'Other' : report.report_type)))),
    [reports],
  )

  const filteredReports = useMemo(() => {
    return [...reports]
      .filter((report) => report.status === 'Open' || report.status === 'In Review')
      .filter((report) => {
        const displayType = report.report_type === 'Other' ? report.custom_concern ?? 'Other' : report.report_type
        const matchesType = typeFilter ? displayType === typeFilter : true
        const matchesUrgency = urgencyFilter ? report.urgency === urgencyFilter : true
        return matchesType && matchesUrgency
      })
      .sort((left, right) => {
        const urgencyGap = (urgencyOrder[left.urgency] ?? 99) - (urgencyOrder[right.urgency] ?? 99)
        if (urgencyGap !== 0) {
          return urgencyGap
        }
        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
      })
  }, [reports, typeFilter, urgencyFilter])

  return (
    <DashboardLayout currentRoute="secretary-reports" navItems={getWorkspaceNav(user?.role)}>
      <section className="rounded-[1.75rem] border border-black/6 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
        <div className="border-b border-black/6 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2f6df6]">Secretary Workspace</p>
          <h1 className="mt-2 text-3xl font-semibold text-[#111827]">Blotter / Incident Reports</h1>
          <p className="mt-2 text-sm text-[#64748b]">
            Review community disputes, garbage complaints, and blotter or incident reports submitted by residents.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3 text-sm text-[#111827] outline-none">
              <option value="">All concern types</option>
              {availableTypes.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <select value={urgencyFilter} onChange={(event) => setUrgencyFilter(event.target.value)} className="rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3 text-sm text-[#111827] outline-none">
              <option value="">All urgency levels</option>
              {['Urgent', 'High', 'Medium', 'Low'].map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-3 px-6 py-6">
          {filteredReports.map((report) => {
            const displayType = report.report_type === 'Other' ? report.custom_concern ?? 'Other' : report.report_type

            return (
              <article key={report.report_id} className="rounded-2xl border border-[#dde6f3] bg-[#fbfdff] px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-[#111827]">{displayType}</p>
                    <p className="mt-1 text-sm text-[#64748b]">
                      {report.resident_name} • {report.purok} • {formatDate(report.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-[#fff1f2] px-3 py-1 text-xs font-semibold text-[#be123c]">{report.urgency}</span>
                    <span className="rounded-full bg-[#eef4ff] px-3 py-1 text-xs font-semibold text-[#1d4ed8]">{report.status}</span>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-[#334155]">{report.description}</p>
                {report.evidence_url ? (
                  <a
                    href={`${API_BASE_URL}${report.evidence_url}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex rounded-xl border border-[#c9d6ec] bg-white px-4 py-2.5 text-sm font-semibold text-[#2f6df6] transition hover:-translate-y-0.5 hover:border-[#2f6df6] hover:bg-[#f5f9ff] active:translate-y-0 active:scale-[0.98]"
                  >
                    View Uploaded Images
                  </a>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  {reportStatuses.map((status) => (
                    <button
                      key={status}
                      type="button"
                      disabled={status === report.status}
                      onClick={() => void updateReport(report.report_id, status)}
                      className="interactive-button rounded-xl border border-[#d8deea] bg-white px-3 py-2 text-xs font-semibold text-[#334155] transition hover:border-[#2f6df6] hover:text-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </article>
            )
          })}
          {filteredReports.length === 0 ? <p className="text-sm text-[#64748b]">No active incident or blotter reports found.</p> : null}
        </div>
      </section>
    </DashboardLayout>
  )
}

export default SecretaryReportsPage
