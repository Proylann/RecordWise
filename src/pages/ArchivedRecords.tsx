import { useEffect, useMemo, useState } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import type { DashboardRoute } from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import { API_BASE_URL, buildQuery, downloadTextFile, parseApiJson, toCsv } from '../lib/api'
import { getWorkspaceNav } from '../navigation'

type ArchiveRecord = {
  record_id: string
  title: string
  description: string
  category: string
  resident_name: string
  status: string
  created_at: string
  source_type?: string | null
  source_id?: string | null
  evidence_url?: string | null
  record_hash: string
  blockchain_tx_hash?: string | null
  blockchain_contract_address?: string | null
  blockchain_network_id?: number | null
}

type VerificationResponse = {
  exists: boolean
  verified: boolean
  record_id?: string | null
  title?: string | null
  category?: string | null
  created_at?: string | null
  resident_name?: string | null
  details: string
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 2v4M16 2v4M3 10h18M5 6h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
    </svg>
  )
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0" />
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-10Z" />
    </svg>
  )
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5" />
    </svg>
  )
}

type ArchivedRecordsPageProps = {
  archiveType: 'workflow' | 'barangay'
  currentRoute: DashboardRoute
  title: string
  description: string
  emptyState: string
}

function ArchivedRecordsPage({ archiveType, currentRoute, title, description, emptyState }: ArchivedRecordsPageProps) {
  const { authenticatedFetch, user } = useAuth()
  const [records, setRecords] = useState<ArchiveRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'requests' | 'incidents'>('all')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'title' | 'category'>('newest')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [recordHash, setRecordHash] = useState('')
  const [verification, setVerification] = useState<VerificationResponse | null>(null)

  useEffect(() => {
    let active = true

    async function loadRecords() {
      setLoading(true)
      setError('')

      const response = await authenticatedFetch(
        `/security-records${buildQuery({
          search: search.trim(),
          date_from: dateFrom,
          date_to: dateTo,
        })}`,
      )
      const data = await parseApiJson<{ records: ArchiveRecord[] }>(response)

      if (!active) {
        return
      }

      if (!response.ok || !data) {
        setError('Unable to load archive records.')
        setRecords([])
      } else {
        setRecords(data.records)
      }

      setLoading(false)
    }

    void loadRecords()

    return () => {
      active = false
    }
  }, [authenticatedFetch, dateFrom, dateTo, search])

  const filteredArchives = useMemo(() => {
    const filtered = records.filter((record) => {
      if (archiveType === 'workflow') {
        if (record.source_type !== 'record_request' && record.source_type !== 'community_report') {
          return false
        }
        if (sourceFilter === 'requests') {
          return record.source_type === 'record_request'
        }
        if (sourceFilter === 'incidents') {
          return record.source_type === 'community_report'
        }
        return true
      }

      return !record.source_type
    })

    return [...filtered].sort((left, right) => {
      if (sortBy === 'oldest') {
        return new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
      }
      if (sortBy === 'title') {
        return left.title.localeCompare(right.title)
      }
      if (sortBy === 'category') {
        return left.category.localeCompare(right.category)
      }
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    })
  }, [archiveType, records, sortBy, sourceFilter])

  async function verifyRecordHash() {
    if (!recordHash.trim()) {
      return
    }

    const response = await authenticatedFetch(
      `/security-records/verify/hash${buildQuery({ record_hash: recordHash.trim() })}`,
    )
    const data = await parseApiJson<VerificationResponse>(response)
    setVerification(response.ok && data ? data : null)
  }

  function exportArchives() {
    const csv = toCsv(
      filteredArchives.map((record) => ({
        RecordID: record.record_id,
        Title: record.title,
        Category: record.category,
        Resident: record.resident_name,
        CreatedAt: formatDate(record.created_at),
        Source: record.source_type ?? 'manual',
        Status: record.status,
        RecordHash: record.record_hash,
      })),
    )
    downloadTextFile('recordwise-archives.csv', csv, 'text/csv;charset=utf-8')
  }

  const archiveCountLabel =
    archiveType === 'barangay' ? `${filteredArchives.length} barangay files` : `${filteredArchives.length} archived workflows`

  return (
    <DashboardLayout currentRoute={currentRoute} navItems={getWorkspaceNav(user?.role)}>
      <section className="space-y-6">
        <div className="rounded-[1.75rem] border border-black/6 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
          <div className="border-b border-black/6 px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2f6df6]">Secretary Workspace</p>
            <h1 className="mt-2 text-3xl font-semibold text-[#111827]">{title}</h1>
            <p className="mt-2 text-sm text-[#64748b]">{description}</p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#dbe4f0] bg-[#f8fbff] px-3 py-2 text-sm font-medium text-[#38507a]">
              <FileIcon />
              <span>{archiveCountLabel}</span>
            </div>
            <div className="mt-5 grid gap-3 xl:grid-cols-5">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search record, resident, category, or hash"
                className="rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3 text-sm outline-none xl:col-span-2"
              />
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3 text-sm outline-none" />
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3 text-sm outline-none" />
              <button type="button" onClick={exportArchives} disabled={filteredArchives.length === 0} className="rounded-2xl bg-[#111827] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
                Export
              </button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {archiveType === 'workflow' ? (
                <select
                  value={sourceFilter}
                  onChange={(event) => setSourceFilter(event.target.value as 'all' | 'requests' | 'incidents')}
                  className="rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3 text-sm text-[#111827] outline-none"
                >
                  <option value="all">All archived items</option>
                  <option value="requests">Requested certificates</option>
                  <option value="incidents">Resolved incidents</option>
                </select>
              ) : (
                <div className="flex items-center rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3 text-sm font-medium text-[#475569]">
                  Showing manually uploaded barangay records
                </div>
              )}
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as 'newest' | 'oldest' | 'title' | 'category')}
                className="rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3 text-sm text-[#111827] outline-none"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="title">Title A-Z</option>
                <option value="category">Category A-Z</option>
              </select>
            </div>
          </div>

          <div className="space-y-4 px-6 py-6">
            {loading ? <p className="text-sm text-[#64748b]">Loading archived records...</p> : null}
            {error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
            {!loading && !error
              ? filteredArchives.map((record) => (
                  <article
                    key={record.record_id}
                    className="rounded-[1.5rem] border border-[#d7e2f0] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-5 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.04)]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 rounded-2xl bg-[#e8f0ff] p-3 text-[#2f6df6]">
                          <FileIcon />
                        </span>
                        <div>
                          <p className="font-semibold text-[#111827]">{record.title}</p>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-[#475569]">
                            <span className="inline-flex items-center gap-2 rounded-full border border-[#d8deea] bg-white px-3 py-1.5">
                              <FolderIcon />
                              {record.category}
                            </span>
                            <span className="inline-flex items-center gap-2 rounded-full border border-[#d8deea] bg-white px-3 py-1.5">
                              <PersonIcon />
                              {record.resident_name}
                            </span>
                            <span className="inline-flex items-center gap-2 rounded-full border border-[#d8deea] bg-white px-3 py-1.5">
                              <CalendarIcon />
                              {formatDate(record.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2 text-right">
                        <span className="block rounded-full bg-[#ecfdf5] px-3 py-1 text-xs font-semibold text-[#047857]">{record.status}</span>
                        <p className="text-[11px] text-[#94a3b8]">{record.record_id}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[#334155]">{record.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-[#64748b]">
                      <span>Hash: {record.record_hash}</span>
                      {record.blockchain_tx_hash ? <span>On-chain tx: {record.blockchain_tx_hash}</span> : null}
                      {record.evidence_url ? (
                        <a href={`${API_BASE_URL}${record.evidence_url}`} target="_blank" rel="noreferrer" className="font-semibold text-[#2f6df6]">
                          View archived evidence
                        </a>
                      ) : null}
                    </div>
                  </article>
                ))
              : null}
            {!loading && !error && filteredArchives.length === 0 ? <p className="text-sm text-[#64748b]">{emptyState}</p> : null}
          </div>
        </div>

        <section className="rounded-[1.75rem] border border-black/6 bg-white px-6 py-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
          <h2 className="text-xl font-semibold text-[#111827]">Archive Verification</h2>
          <p className="mt-2 text-sm text-[#64748b]">Check whether a stored record hash still matches the archived payload.</p>
          <div className="mt-4 flex flex-col gap-3 md:flex-row">
            <input
              value={recordHash}
              onChange={(event) => setRecordHash(event.target.value)}
              placeholder="Enter record hash"
              className="flex-1 rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3 text-sm outline-none"
            />
            <button type="button" onClick={() => void verifyRecordHash()} className="rounded-2xl bg-[#2f6df6] px-5 py-3 text-sm font-semibold text-white">
              Verify
            </button>
          </div>
          {verification ? (
            <div className={`mt-4 rounded-2xl px-4 py-4 text-sm ${verification.verified ? 'border border-emerald-200 bg-emerald-50 text-emerald-800' : 'border border-amber-200 bg-amber-50 text-amber-800'}`}>
              <p className="font-semibold">{verification.verified ? 'Hash verified' : verification.exists ? 'Hash mismatch detected' : 'No record found'}</p>
              <p className="mt-2">{verification.details}</p>
              {verification.record_id ? <p className="mt-2">Record: {verification.record_id} • {verification.title}</p> : null}
            </div>
          ) : null}
        </section>
      </section>
    </DashboardLayout>
  )
}

export default ArchivedRecordsPage
