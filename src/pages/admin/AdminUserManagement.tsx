import { useEffect, useMemo, useState } from 'react'
import DashboardLayout, { type DashboardRoute } from '../../components/DashboardLayout'
import { useAuth } from '../../context/AuthContext'
import { buildQuery, parseApiJson } from '../../lib/api'
import { getWorkspaceNav } from '../../navigation'

type AdminUser = {
  email: string
  first_name?: string | null
  middle_name?: string | null
  last_name?: string | null
  purok?: string | null
  role: string
  archived: boolean
  created_at?: string | null
}

type Props = {
  role: 'resident' | 'secretary'
  currentRoute: DashboardRoute
  title: string
  description: string
}

const puroks = ['Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5', 'Purok 6', 'Purok 7']
const emptyForm = { first_name: '', middle_name: '', last_name: '', email: '', purok: 'Purok 1', password: '' }
const pageSize = 8

type SortKey = 'name' | 'email' | 'role' | 'purok' | 'status' | 'created_at'
type SortDirection = 'asc' | 'desc'
type ConfirmAction = 'archive' | 'delete'

type ConfirmDialogState = {
  action: ConfirmAction
  email: string
  name: string
} | null

function formatDate(value?: string | null) {
  if (!value) return 'N/A'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function getFullName(entry: AdminUser) {
  return [entry.first_name, entry.middle_name, entry.last_name].filter(Boolean).join(' ')
}

function AdminUserManagementPage({ role, currentRoute, title, description }: Props) {
  const { authenticatedFetch, user } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null)

  async function loadUsers() {
    const response = await authenticatedFetch(`/admin/users${buildQuery({ role, search: search.trim(), archived: showArchived })}`)
    const data = await parseApiJson<AdminUser[] | { detail?: string }>(response)
    if (!response.ok) {
      setError(data && 'detail' in data && data.detail ? data.detail : 'Unable to load accounts.')
      setUsers([])
      return
    }
    setError('')
    setUsers(Array.isArray(data) ? data : [])
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [search, showArchived, role])

  useEffect(() => {
    void loadUsers()
  }, [authenticatedFetch, role, search, showArchived])

  function closeModal() {
    setIsModalOpen(false)
    setEditing(null)
    setForm(emptyForm)
    setError('')
  }

  function openCreateModal() {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setIsModalOpen(true)
  }

  function beginEdit(entry: AdminUser) {
    setEditing(entry)
    setForm({
      first_name: entry.first_name ?? '',
      middle_name: entry.middle_name ?? '',
      last_name: entry.last_name ?? '',
      email: entry.email,
      purok: entry.purok ?? 'Purok 1',
      password: '',
    })
    setError('')
    setIsModalOpen(true)
  }

  async function submitForm() {
    setError('')
    setNotice('')
    const response = await authenticatedFetch(editing ? `/admin/users/${encodeURIComponent(editing.email)}` : '/admin/users', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: form.first_name,
        middle_name: form.middle_name,
        last_name: form.last_name,
        email: form.email,
        purok: role === 'resident' ? form.purok : form.purok || undefined,
        password: form.password || undefined,
        role,
        archived: editing?.archived ?? false,
      }),
    })
    const data = await parseApiJson<{ detail?: string }>(response)
    if (!response.ok) {
      setError(data?.detail ?? 'Unable to save account.')
      return
    }
    setNotice(editing ? 'Account updated.' : 'Account created.')
    closeModal()
    void loadUsers()
  }

  async function archiveUser(email: string) {
    const response = await authenticatedFetch(`/admin/users/${encodeURIComponent(email)}`, { method: 'DELETE' })
    const data = await parseApiJson<{ detail?: string }>(response)
    if (response.ok) {
      setNotice('Account archived.')
      setError('')
      void loadUsers()
      return
    }
    setError(data?.detail ?? 'Unable to archive account.')
  }

  async function restoreUser(email: string) {
    const response = await authenticatedFetch(`/admin/users/${encodeURIComponent(email)}/restore`, { method: 'POST' })
    const data = await parseApiJson<{ detail?: string }>(response)
    if (response.ok) {
      setNotice('Account restored.')
      setError('')
      void loadUsers()
      return
    }
    setError(data?.detail ?? 'Unable to restore account.')
  }

  async function deleteUser(email: string) {
    const response = await authenticatedFetch(`/admin/users/${encodeURIComponent(email)}/permanent`, { method: 'DELETE' })
    const data = await parseApiJson<{ detail?: string }>(response)
    if (response.ok) {
      setNotice('Account deleted permanently.')
      setError('')
      void loadUsers()
      return
    }
    setError(data?.detail ?? 'Unable to delete account.')
  }

  function requestConfirmation(action: ConfirmAction, entry: AdminUser) {
    setConfirmDialog({
      action,
      email: entry.email,
      name: getFullName(entry) || entry.email,
    })
  }

  async function confirmAccountAction() {
    if (!confirmDialog) {
      return
    }

    setNotice('')
    if (confirmDialog.action === 'archive') {
      await archiveUser(confirmDialog.email)
    } else {
      await deleteUser(confirmDialog.email)
    }
    setConfirmDialog(null)
  }

  function handleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(nextKey)
    setSortDirection(nextKey === 'created_at' ? 'desc' : 'asc')
  }

  const sortedUsers = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1
    return [...users].sort((left, right) => {
      const leftName = getFullName(left).toLowerCase()
      const rightName = getFullName(right).toLowerCase()
      const leftValue =
        sortKey === 'name'
          ? leftName
          : sortKey === 'status'
            ? left.archived
              ? 'archived'
              : 'active'
            : sortKey === 'created_at'
              ? new Date(left.created_at ?? 0).getTime()
              : String(left[sortKey] ?? '').toLowerCase()
      const rightValue =
        sortKey === 'name'
          ? rightName
          : sortKey === 'status'
            ? right.archived
              ? 'archived'
              : 'active'
            : sortKey === 'created_at'
              ? new Date(right.created_at ?? 0).getTime()
              : String(right[sortKey] ?? '').toLowerCase()

      if (leftValue < rightValue) {
        return -1 * direction
      }
      if (leftValue > rightValue) {
        return 1 * direction
      }
      return leftName.localeCompare(rightName) * direction
    })
  }, [sortDirection, sortKey, users])

  const totalPages = Math.max(1, Math.ceil(sortedUsers.length / pageSize))

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return sortedUsers.slice(startIndex, startIndex + pageSize)
  }, [currentPage, sortedUsers])

  function renderSortButton(label: string, key: SortKey) {
    const isActive = sortKey === key
    const indicator = isActive ? (sortDirection === 'asc' ? 'ASC' : 'DESC') : 'SORT'

    return (
      <button
        type="button"
        onClick={() => handleSort(key)}
        className={`interactive-button inline-flex items-center gap-1 rounded-xl px-2 py-1 text-left text-xs font-semibold uppercase tracking-[0.16em] ${
          isActive ? 'bg-[#eaf1ff] text-[#1d4ed8]' : 'text-[#94a3b8] hover:bg-[#f3f7fd] hover:text-[#475569]'
        }`}
      >
        <span>{label}</span>
        <span aria-hidden="true">{indicator}</span>
      </button>
    )
  }

  return (
    <DashboardLayout currentRoute={currentRoute} navItems={getWorkspaceNav(user?.role)}>
      <section className="rounded-[1.75rem] border border-black/6 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
        <div className="border-b border-black/6 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2f6df6]">Admin Workspace</p>
          <div className="mt-2 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-[#111827]">{title}</h1>
              <p className="mt-2 text-sm text-[#64748b]">{description}</p>
            </div>
            <button
              type="button"
              onClick={openCreateModal}
              className="interactive-button-strong rounded-2xl bg-[#2f6df6] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(47,109,246,0.24)] hover:bg-[#245de0]"
            >
              Create account
            </button>
          </div>
        </div>

        <div className="px-6 py-6">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${role} accounts`}
              className="w-full rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3 text-sm outline-none md:max-w-xl"
            />
            <label className="flex items-center gap-3 rounded-2xl border border-[#d8deea] bg-[#f8fbff] px-4 py-3 text-sm text-[#334155]">
              <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
              Show archived
            </label>
          </div>

          {notice ? <p className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p> : null}
          {error ? <p className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

          <div className="overflow-hidden rounded-[1.5rem] border border-[#d8e2f0]">
            <table className="min-w-full border-separate border-spacing-0">
              <thead>
                <tr className="bg-[#f8fafc] text-left">
                  <th className="px-5 py-4">{renderSortButton('Account Holder', 'name')}</th>
                  <th className="px-5 py-4">{renderSortButton('Email', 'email')}</th>
                  <th className="px-5 py-4">{renderSortButton('Type', 'role')}</th>
                  <th className="px-5 py-4">{renderSortButton('Purok', 'purok')}</th>
                  <th className="px-5 py-4">{renderSortButton('Status', 'status')}</th>
                  <th className="px-5 py-4">{renderSortButton('Created', 'created_at')}</th>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedUsers.map((entry) => (
                  <tr key={entry.email} className="text-sm text-[#334155]">
                    <td className="border-t border-black/6 px-5 py-4">
                      <p className="font-semibold text-[#111827]">{getFullName(entry)}</p>
                      <p className="mt-1 text-xs text-[#94a3b8]">{entry.archived ? 'Archived account' : 'Active account'}</p>
                    </td>
                    <td className="border-t border-black/6 px-5 py-4">{entry.email}</td>
                    <td className="border-t border-black/6 px-5 py-4">
                      <span className="rounded-full bg-[#eef4ff] px-3 py-1 text-xs font-semibold text-[#1d4ed8]">
                        {entry.role === 'secretary' ? 'Staff' : 'Resident'}
                      </span>
                    </td>
                    <td className="border-t border-black/6 px-5 py-4">{entry.purok ?? 'System-wide'}</td>
                    <td className="border-t border-black/6 px-5 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${entry.archived ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {entry.archived ? 'Archived' : 'Active'}
                      </span>
                    </td>
                    <td className="border-t border-black/6 px-5 py-4">{formatDate(entry.created_at)}</td>
                    <td className="border-t border-black/6 px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => beginEdit(entry)} className="interactive-button rounded-xl border border-[#c9d7ee] bg-white px-3 py-2 text-xs font-semibold text-[#1e3a8a] hover:border-[#2f6df6] hover:bg-[#f5f9ff]">
                          Edit
                        </button>
                        {entry.archived ? (
                          <button type="button" onClick={() => void restoreUser(entry.email)} className="interactive-button rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700">
                            Restore
                          </button>
                        ) : (
                          <button type="button" onClick={() => requestConfirmation('archive', entry)} className="interactive-button rounded-xl bg-amber-500 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-600">
                            Archive
                          </button>
                        )}
                        <button type="button" onClick={() => requestConfirmation('delete', entry)} className="interactive-button rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {paginatedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-sm text-[#64748b]">
                      No accounts found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {sortedUsers.length > 0 ? (
            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-[#64748b]">
                Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, sortedUsers.length)} of {sortedUsers.length} accounts
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                  className="interactive-button rounded-xl border border-[#d8deea] bg-white px-4 py-2 text-sm font-semibold text-[#334155] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="rounded-xl bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#475569]">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                  className="interactive-button rounded-xl border border-[#d8deea] bg-white px-4 py-2 text-sm font-semibold text-[#334155] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[1.75rem] border border-[#d8e2f0] bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between gap-4 border-b border-black/6 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2f6df6]">{editing ? 'Update account' : 'Create account'}</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#111827]">
                  {editing ? 'Edit account details' : `Add new ${role === 'secretary' ? 'staff' : 'resident'} account`}
                </h2>
              </div>
              <button type="button" onClick={closeModal} className="interactive-button rounded-xl border border-[#d8deea] bg-white px-3 py-2 text-sm font-semibold text-[#334155] hover:bg-[#f8fafc]">
                Close
              </button>
            </div>
            <div className="grid gap-3 px-6 py-6 md:grid-cols-2">
              <input value={form.first_name} onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))} placeholder="First name" className="rounded-2xl border border-[#d8deea] bg-white px-4 py-3 text-sm outline-none" />
              <input value={form.middle_name} onChange={(event) => setForm((current) => ({ ...current, middle_name: event.target.value }))} placeholder="Middle name" className="rounded-2xl border border-[#d8deea] bg-white px-4 py-3 text-sm outline-none" />
              <input value={form.last_name} onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))} placeholder="Last name" className="rounded-2xl border border-[#d8deea] bg-white px-4 py-3 text-sm outline-none" />
              <input value={form.email} disabled={Boolean(editing)} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" className="rounded-2xl border border-[#d8deea] bg-white px-4 py-3 text-sm outline-none disabled:bg-[#f8fafc]" />
              {role === 'resident' ? (
                <select value={form.purok} onChange={(event) => setForm((current) => ({ ...current, purok: event.target.value }))} className="rounded-2xl border border-[#d8deea] bg-white px-4 py-3 text-sm outline-none">
                  {puroks.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center rounded-2xl border border-[#d8deea] bg-[#f8fbff] px-4 py-3 text-sm text-[#64748b]">Staff accounts are not tied to one purok.</div>
              )}
              <input value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder={editing ? 'New password (optional)' : 'Password'} className="rounded-2xl border border-[#d8deea] bg-white px-4 py-3 text-sm outline-none" />
            </div>
            <div className="flex justify-end gap-3 px-6 py-6">
              <button type="button" onClick={closeModal} className="interactive-button rounded-2xl border border-[#d8deea] bg-white px-5 py-3 text-sm font-semibold text-[#334155] hover:bg-[#f8fafc]">
                Cancel
              </button>
              <button type="button" onClick={() => void submitForm()} className="interactive-button-strong rounded-2xl bg-[#2f6df6] px-5 py-3 text-sm font-semibold text-white hover:bg-[#245de0]">
                {editing ? 'Save changes' : 'Create account'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDialog ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[1.75rem] border border-rose-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
            <div className="border-b border-rose-100 px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-600">Confirm action</p>
              <h2 className="mt-2 text-2xl font-semibold text-[#111827]">
                {confirmDialog.action === 'delete' ? 'Are you sure you want to delete this account?' : 'Are you sure you want to archive this account?'}
              </h2>
              <p className="mt-2 text-sm text-[#64748b]">
                {confirmDialog.name} ({confirmDialog.email}) will {confirmDialog.action === 'delete' ? 'be permanently removed and cannot be restored.' : 'be moved to the archived list until restored.'}
              </p>
            </div>
            <div className="flex justify-end gap-3 px-6 py-6">
              <button type="button" onClick={() => setConfirmDialog(null)} className="interactive-button rounded-2xl border border-[#d8deea] bg-white px-5 py-3 text-sm font-semibold text-[#334155] hover:bg-[#f8fafc]">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmAccountAction()}
                className={`interactive-button-strong rounded-2xl px-5 py-3 text-sm font-semibold text-white ${
                  confirmDialog.action === 'delete' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-500 hover:bg-amber-600'
                }`}
              >
                {confirmDialog.action === 'delete' ? 'Delete account' : 'Archive account'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardLayout>
  )
}

export default AdminUserManagementPage
