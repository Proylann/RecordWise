import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import { API_BASE_URL, MAX_UPLOAD_SIZE_BYTES, parseApiJson } from '../lib/api'
import { getWorkspaceNav } from '../navigation'

const reportTypes = ['Garbage Not Collected', 'Neighborhood Dispute', 'Blotter / Incident Report', 'Street Concern', 'Other']
const urgencyOptions = ['Low', 'Medium', 'High', 'Urgent']
type CommunityReport = {
  report_id: string
  report_type: string
  custom_concern?: string | null
  description: string
  urgency: string
  status: string
  created_at: string
  evidence_filename?: string | null
  evidence_url?: string | null
}

function ReportProblemPage() {
  const { authenticatedFetch, user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [reportType, setReportType] = useState('')
  const [customConcern, setCustomConcern] = useState('')
  const [urgency, setUrgency] = useState('Medium')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [reports, setReports] = useState<CommunityReport[]>([])
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({
    type: 'idle',
    message: '',
  })

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus({ type: 'idle', message: '' })
    if (file && file.size > MAX_UPLOAD_SIZE_BYTES) {
      setStatus({ type: 'error', message: 'Photo evidence exceeds the 10 MB limit.' })
      return
    }
    const payload = new FormData()
    payload.append('report_type', reportType)
    payload.append('custom_concern', customConcern)
    payload.append('description', description)
    payload.append('urgency', urgency)
    if (file) {
      payload.append('evidence', file)
    }

    const response = await authenticatedFetch('/community-reports', { method: 'POST', body: payload })
    const data = await parseApiJson<CommunityReport | { detail?: string }>(response)
    if (response.ok && data && 'report_id' in data) {
      setStatus({ type: 'success', message: `${data.report_id} submitted successfully.` })
      setReportType('')
      setCustomConcern('')
      setUrgency('Medium')
      setDescription('')
      setFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      void loadReports()
    } else {
      setStatus({
        type: 'error',
        message: data && 'detail' in data && data.detail ? data.detail : 'Unable to submit report.',
      })
    }
  }

  return (
    <DashboardLayout currentRoute="report-problem" navItems={getWorkspaceNav(user?.role)}>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_420px]">
        <section className="rounded-[1.75rem] border border-black/6 bg-white px-6 py-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2f6df6]">Resident Services</p>
          <h1 className="mt-2 text-3xl font-semibold text-[#111827]">Report Problems</h1>
          <p className="mt-2 text-sm text-[#64748b]">Report disputes, garbage issues, and blotter concerns with urgency and required photo evidence.</p>

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <select value={reportType} onChange={(event) => setReportType(event.target.value)} required className="w-full rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3.5 text-sm text-[#111827] outline-none">
                <option value="">Select report type</option>
                {reportTypes.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <select value={urgency} onChange={(event) => setUrgency(event.target.value)} required className="w-full rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3.5 text-sm text-[#111827] outline-none">
                {urgencyOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            {reportType === 'Other' ? (
              <input
                type="text"
                value={customConcern}
                onChange={(event) => setCustomConcern(event.target.value)}
                placeholder="Type your other concern"
                required
                className="w-full rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3.5 text-sm text-[#111827] outline-none"
              />
            ) : null}

            <textarea value={description} onChange={(event) => setDescription(event.target.value)} required rows={6} placeholder="Describe the issue and location" className="w-full rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3.5 text-sm text-[#111827] outline-none" />
            <div className="rounded-2xl border border-dashed border-[#c6d3ea] bg-[#f8fbff] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-[#475569]">{file ? file.name : 'Upload required photo evidence'}</p>
                <div className="flex gap-2">
                  <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] ?? null)} className="hidden" />
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-xl border border-[#c9d6ec] bg-white px-4 py-2 text-sm font-semibold text-[#2f6df6]">Choose File</button>
                </div>
              </div>
              <p className="mt-2 text-xs text-[#94a3b8]">Maximum file size: 10 MB</p>
            </div>
            {status.type !== 'idle' ? (
              <div
                className={`rounded-2xl px-4 py-3 text-sm font-medium ${
                  status.type === 'success'
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border border-rose-200 bg-rose-50 text-rose-700'
                }`}
              >
                {status.message}
              </div>
            ) : null}
            <button type="submit" className="rounded-2xl bg-[#111827] px-5 py-3 text-sm font-semibold text-white">Submit Report</button>
          </form>
        </section>

        <section className="rounded-[1.75rem] border border-black/6 bg-white px-6 py-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
          <h2 className="text-xl font-semibold text-[#111827]">My Reports</h2>
          <div className="mt-5 space-y-3">
            {reports.slice(0, 5).map((report) => (
              <article key={report.report_id} className="rounded-2xl border border-[#dde6f3] bg-[#fbfdff] px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#111827]">
                      {report.report_type === 'Other' ? report.custom_concern ?? 'Other Concern' : report.report_type}
                    </p>
                    <p className="mt-1 text-sm text-[#64748b]">{report.report_id}</p>
                  </div>
                  <span className="rounded-full bg-[#fff1f2] px-3 py-1 text-xs font-semibold text-[#be123c]">{report.urgency}</span>
                </div>
                <p className="mt-2 text-sm text-[#334155]">{report.description}</p>
                {report.evidence_url ? (
                  <a
                    href={`${API_BASE_URL}${report.evidence_url}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex text-sm font-semibold text-[#2f6df6]"
                  >
                    View uploaded evidence
                  </a>
                ) : null}
                <div className="mt-3">
                  <span className="inline-flex rounded-full bg-[#eef4ff] px-3 py-1 text-xs font-semibold text-[#1d4ed8]">{report.status}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </DashboardLayout>
  )
}

export default ReportProblemPage
