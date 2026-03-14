import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import { MAX_UPLOAD_SIZE_BYTES, parseApiJson } from '../lib/api'
import { getWorkspaceNav } from '../navigation'

const documentTypeOptions = [
  'Resident Record',
  'Certificate Archive',
  'Blotter / Incident Report',
  'Financial Assistance',
  'Resolution / Ordinance',
  'Other',
]

const archiveReasonOptions = [
  'Compliance filing',
  'Audit trail reference',
  'Case documentation',
  'Historical record keeping',
  'Legal records retention',
  'Administrative documentation',
  'Other official archive purpose',
]

type CreatedRecordResponse = {
  record_id: string
  blockchain_tx_hash?: string | null
}

function SubmitRecordPage() {
  const { authenticatedFetch, user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    documentType: '',
    otherCategory: '',
  })
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({
    type: 'idle',
    message: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null)
  }

  const resetForm = () => {
    setForm({
      title: '',
      description: '',
      documentType: '',
      otherCategory: '',
    })
    setFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatus({ type: 'idle', message: '' })
    setIsSubmitting(true)

    try {
      if (file && file.size > MAX_UPLOAD_SIZE_BYTES) {
        throw new Error('Document exceeds the 10 MB file size limit.')
      }

      const payload = new FormData()
      payload.append('title', form.title)
      payload.append('description', form.description)
      payload.append('category', form.documentType === 'Other' ? form.otherCategory : form.documentType)
      payload.append('resident_name', 'Barangay Archive')
      payload.append('risk_level', 'Low')
      if (file) {
        payload.append('evidence', file)
      }

      const response = await authenticatedFetch('/security-records', {
        method: 'POST',
        body: payload,
      })
      const data = await parseApiJson<CreatedRecordResponse | { detail?: string }>(response)

      if (!response.ok || !data || !('record_id' in data)) {
        throw new Error(data && 'detail' in data && data.detail ? data.detail : 'Failed to upload the document')
      }

      setStatus({
        type: 'success',
        message: data.blockchain_tx_hash
          ? `Archive record ${data.record_id} was stored on-chain. Transaction: ${data.blockchain_tx_hash}.`
          : `Archive record ${data.record_id} was uploaded successfully.`,
      })
      resetForm()
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to upload the document',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <DashboardLayout currentRoute="archive-records" navItems={getWorkspaceNav(user?.role)}>
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2f6df6]">Secretary Workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-[#111827] sm:text-[2.35rem]">
            Upload Documents
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#64748b]">
            Upload official barangay files such as PDFs, DOCX files, and scanned images into the RecordWise archive.
          </p>
        </header>

        <section className="rounded-[2rem] border border-black/6 bg-white/92 px-5 py-6 shadow-[0_24px_56px_rgba(15,23,42,0.08)] backdrop-blur sm:px-8 sm:py-8">
          <form className="space-y-6" onSubmit={onSubmit}>
            <div>
              <label htmlFor="title" className="mb-3 block text-xl font-semibold text-[#111827]">
                Record Title
              </label>
              <input
                id="title"
                type="text"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Enter the document title"
                required
                className="w-full rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-5 py-4 text-base text-[#111827] outline-none transition focus:border-[#2f6df6] focus:ring-4 focus:ring-[#2f6df6]/10"
              />
            </div>

            <div>
              <label htmlFor="description" className="mb-3 block text-xl font-semibold text-[#111827]">
                Reason
              </label>
              <select
                id="description"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                required
                className="w-full rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-5 py-4 text-base text-[#111827] outline-none transition focus:border-[#2f6df6] focus:ring-4 focus:ring-[#2f6df6]/10"
              >
                <option value="">Select archive reason</option>
                {archiveReasonOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="documentType" className="mb-3 block text-xl font-semibold text-[#111827]">
                Category
              </label>
              <select
                id="documentType"
                value={form.documentType}
                onChange={(event) => setForm((current) => ({ ...current, documentType: event.target.value }))}
                required
                className="w-full rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-5 py-4 text-base font-medium text-[#111827] outline-none transition focus:border-[#2f6df6] focus:ring-4 focus:ring-[#2f6df6]/10"
              >
                <option value="">Select document type</option>
                {documentTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            {form.documentType === 'Other' ? (
              <div>
                <label htmlFor="otherCategory" className="mb-3 block text-xl font-semibold text-[#111827]">
                  Category (if other type)
                </label>
                <input
                  id="otherCategory"
                  type="text"
                  value={form.otherCategory}
                  onChange={(event) => setForm((current) => ({ ...current, otherCategory: event.target.value }))}
                  placeholder="Type the document category"
                  required
                  className="w-full rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-5 py-4 text-base text-[#111827] outline-none transition focus:border-[#2f6df6] focus:ring-4 focus:ring-[#2f6df6]/10"
                />
              </div>
            ) : null}

            <div>
              <label htmlFor="evidence" className="mb-3 block text-xl font-semibold text-[#111827]">
                Upload
              </label>
              <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-[#c6d3ea] bg-[#f8fbff] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#111827]">{file ? file.name : 'Choose document file'}</p>
                  <p className="text-sm text-[#94a3b8]">PDF, DOC, DOCX, JPG, JPEG, PNG • Max 10 MB</p>
                </div>
                <div className="flex gap-3">
                  <input
                    ref={fileInputRef}
                    id="evidence"
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={onFileChange}
                    className="hidden"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="interactive-button rounded-2xl border border-[#c9d6ec] bg-white px-5 py-3 text-sm font-semibold text-[#2f6df6] transition hover:border-[#2f6df6] hover:bg-[#f5f9ff]"
                  >
                    Choose File
                  </button>
                  {file ? (
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null)
                        if (fileInputRef.current) {
                          fileInputRef.current.value = ''
                        }
                      }}
                      className="interactive-button rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] px-5 py-3 text-sm font-semibold text-[#64748b] transition hover:bg-white"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
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

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="interactive-button-strong inline-flex items-center justify-center gap-2 rounded-2xl bg-[#2f6df6] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(47,109,246,0.24)] transition hover:-translate-y-0.5 hover:bg-[#245de0] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
              >
                {isSubmitting ? 'Uploading...' : 'Upload Document'}
              </button>
              <button
                type="button"
                onClick={() => {
                  resetForm()
                  setStatus({ type: 'idle', message: '' })
                }}
                className="interactive-button rounded-2xl border border-[#dbe3f0] bg-[#eef2f7] px-5 py-3.5 text-sm font-semibold text-[#64748b] transition hover:bg-white"
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      </div>
    </DashboardLayout>
  )
}

export default SubmitRecordPage
