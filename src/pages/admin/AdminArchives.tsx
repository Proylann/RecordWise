import { useEffect, useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import { useAuth } from '../../context/AuthContext'
import { API_BASE_URL, buildQuery, parseApiJson } from '../../lib/api'
import { getWorkspaceNav } from '../../navigation'

type ArchiveRecord = {
  record_id: string
  title: string
  description: string
  category: string
  resident_name: string
  created_at: string
  evidence_url?: string | null
  record_hash: string
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function AdminArchivesPage() {
  const { authenticatedFetch, user } = useAuth()
  const [records, setRecords] = useState<ArchiveRecord[]>([])
  const [search, setSearch] = useState('')

  async function loadRecords() {
    const response = await authenticatedFetch(`/security-records${buildQuery({ search: search.trim() })}`)
    const data = await parseApiJson<{ records: ArchiveRecord[] }>(response)
    setRecords(response.ok && data ? data.records : [])
  }

  useEffect(() => {
    void loadRecords()
  }, [search])

  async function deleteRecord(recordId: string) {
    const shouldDelete = window.confirm(`Are you sure you want to delete archive record ${recordId}?`)
    if (!shouldDelete) {
      return
    }
    const response = await authenticatedFetch(`/admin/security-records/${recordId}`, { method: 'DELETE' })
    if (response.ok) {
      void loadRecords()
    }
  }

  return (
    <DashboardLayout currentRoute="admin-archives" navItems={getWorkspaceNav(user?.role)}>
      <section className="rounded-[1.75rem] border border-black/6 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
        <div className="border-b border-black/6 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2f6df6]">Admin Workspace</p>
          <h1 className="mt-2 text-3xl font-semibold text-[#111827]">Archives</h1>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search archives"
            className="mt-5 w-full rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3 text-sm outline-none"
          />
        </div>
        <div className="space-y-3 px-6 py-6">
          {records.map((record) => (
            <article key={record.record_id} className="rounded-2xl border border-[#dde6f3] bg-[#fbfdff] px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-[#111827]">{record.title}</p>
                  <p className="mt-1 text-sm text-[#64748b]">
                    {record.category} • {record.resident_name} • {formatDate(record.created_at)}
                  </p>
                  <p className="mt-3 text-sm text-[#334155]">{record.description}</p>
                  <p className="mt-2 text-xs text-[#94a3b8]">Hash: {record.record_hash}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {record.evidence_url ? (
                    <a href={`${API_BASE_URL}${record.evidence_url}`} target="_blank" rel="noreferrer" className="rounded-xl border border-[#d8deea] bg-white px-3 py-2 text-xs font-semibold text-[#334155]">
                      Evidence
                    </a>
                  ) : null}
                  <button type="button" onClick={() => void deleteRecord(record.record_id)} className="rounded-xl bg-[#111827] px-3 py-2 text-xs font-semibold text-white">
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
          {records.length === 0 ? <p className="text-sm text-[#64748b]">No archive records found.</p> : null}
        </div>
      </section>
    </DashboardLayout>
  )
}

export default AdminArchivesPage
