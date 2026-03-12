import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import { MAX_UPLOAD_SIZE_BYTES, parseApiJson } from '../lib/api'
import { getWorkspaceNav } from '../navigation'

const requestTypes = [
  'Barangay Clearance',
  'Certificate of Residency',
  'Certificate of Indigency',
  'Business Clearance',
]

type RecordRequest = {
  request_id: string
  request_type: string
  purpose: string
  status: string
  created_at: string
}

function RequestRecordPage() {
  const { authenticatedFetch, user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [requestType, setRequestType] = useState('')
  const [purpose, setPurpose] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [requests, setRequests] = useState<RecordRequest[]>([])
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({
    type: 'idle',
    message: '',
  })

  async function loadRequests() {
    const response = await authenticatedFetch('/record-requests')
    const data = await parseApiJson<RecordRequest[]>(response)
    if (response.ok) {
      setRequests(data ?? [])
    }
  }

  useEffect(() => {
    let active = true

    void (async () => {
      const response = await authenticatedFetch('/record-requests')
      const data = await parseApiJson<RecordRequest[]>(response)
      if (active && response.ok) {
        setRequests(data ?? [])
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
      setStatus({ type: 'error', message: 'Attachment exceeds the 10 MB limit.' })
      return
    }
    const payload = new FormData()
    payload.append('request_type', requestType)
    payload.append('purpose', purpose)
    if (file) {
      payload.append('evidence', file)
    }

    const response = await authenticatedFetch('/record-requests', { method: 'POST', body: payload })
    const data = await parseApiJson<RecordRequest | { detail?: string }>(response)
    if (response.ok && data && 'request_id' in data) {
      setStatus({ type: 'success', message: `${data.request_id} submitted successfully.` })
      setRequestType('')
      setPurpose('')
      setFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      void loadRequests()
    } else {
      setStatus({
        type: 'error',
        message: data && 'detail' in data && data.detail ? data.detail : 'Unable to submit request.',
      })
    }
  }

  return (
    <DashboardLayout currentRoute="request-record" navItems={getWorkspaceNav(user?.role)}>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_420px]">
        <section className="rounded-[1.75rem] border border-black/6 bg-white px-6 py-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2f6df6]">Resident Services</p>
          <h1 className="mt-2 text-3xl font-semibold text-[#111827]">Request for Record</h1>
          <p className="mt-2 text-sm text-[#64748b]">Submit your barangay document request and attach supporting proof if needed.</p>
          <p className="mt-2 text-sm text-amber-700">
            Weekly limit: most document types allow 2 requests every 7 days. Business Clearance allows 1 request every 7 days.
          </p>

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <select value={requestType} onChange={(event) => setRequestType(event.target.value)} required className="w-full rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3.5 text-sm text-[#111827] outline-none">
              <option value="">Select request type</option>
              {requestTypes.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} required rows={5} placeholder="State the purpose of your request" className="w-full rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3.5 text-sm text-[#111827] outline-none" />
            <div className="rounded-2xl border border-dashed border-[#c6d3ea] bg-[#f8fbff] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-[#475569]">{file ? file.name : 'Optional supporting attachment'}</p>
                <div className="flex gap-2">
                  <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] ?? null)} className="hidden" />
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="interactive-button rounded-xl border border-[#c9d6ec] bg-white px-4 py-2 text-sm font-semibold text-[#2f6df6] hover:border-[#2f6df6] hover:bg-[#f5f9ff]">Choose File</button>
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
            <button type="submit" className="interactive-button-strong rounded-2xl bg-[#2f6df6] px-5 py-3 text-sm font-semibold text-white hover:bg-[#245de0]">Submit Request</button>
          </form>
        </section>

        <section className="rounded-[1.75rem] border border-black/6 bg-white px-6 py-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
          <h2 className="text-xl font-semibold text-[#111827]">Recent Requests</h2>
          <div className="mt-5 space-y-3">
            {requests.slice(0, 5).map((request) => (
              <article key={request.request_id} className="rounded-2xl border border-[#dde6f3] bg-[#fbfdff] px-4 py-4">
                <p className="font-semibold text-[#111827]">{request.request_type}</p>
                <p className="mt-1 text-sm text-[#64748b]">{request.request_id}</p>
                <p className="mt-2 text-sm text-[#334155]">{request.purpose}</p>
                <span className="mt-3 inline-flex rounded-full bg-[#eef4ff] px-3 py-1 text-xs font-semibold text-[#1d4ed8]">{request.status}</span>
              </article>
            ))}
          </div>
        </section>
      </div>
    </DashboardLayout>
  )
}

export default RequestRecordPage
