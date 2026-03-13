import { useState, type ComponentType, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export type DashboardRoute =
  | 'dashboard'
  | 'admin-residents'
  | 'admin-staff'
  | 'admin-requests'
  | 'admin-incidents'
  | 'admin-logs'
  | 'admin-activities'
  | 'admin-archives'
  | 'request-record'
  | 'records-queue'
  | 'report-problem'
  | 'secretary-requests'
  | 'process-request'
  | 'secretary-reports'
  | 'archive-records'
  | 'certificate-incident-archives'
  | 'barangay-record-archives'
  | 'activity-logs'
  | 'profile'

export type DashboardNavItem = {
  label: string
  href?: string
  route?: DashboardRoute
  children?: Array<{ label: string; href: string; route: DashboardRoute }>
}

type DashboardLayoutProps = {
  currentRoute: DashboardRoute
  navItems: DashboardNavItem[]
  children: ReactNode
}

type IconProps = {
  className?: string
}

function DashboardIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden="true">
      <path d="M4 13h6V5H4v8Z" />
      <path d="M14 19h6V11h-6v8Z" />
      <path d="M14 5h6v2h-6z" />
      <path d="M4 17h6v2H4z" />
    </svg>
  )
}

function RequestIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden="true">
      <path d="M8 7h8" />
      <path d="M8 11h8" />
      <path d="M8 15h5" />
      <path d="M6 3h9l4 4v14H6V3Z" />
      <path d="M15 3v4h4" />
    </svg>
  )
}

function QueueIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h10" />
      <circle cx="18" cy="17" r="2" />
    </svg>
  )
}

function ReportIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden="true">
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
      <path d="M10.3 3.84 2.82 17a2 2 0 0 0 1.74 3h14.88a2 2 0 0 0 1.74-3L13.7 3.84a2 2 0 0 0-3.48 0Z" />
    </svg>
  )
}

function ArchiveIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden="true">
      <path d="M4 7h16v12H4z" />
      <path d="M2 7V4h20v3" />
      <path d="M10 12h4" />
    </svg>
  )
}

function ArchiveItemIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden="true">
      <path d="M7 4h7l4 4v12H7V4Z" />
      <path d="M14 4v4h4" />
      <path d="M10 12h5" />
      <path d="M10 16h4" />
    </svg>
  )
}

function LogsIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden="true">
      <path d="M8 6h12" />
      <path d="M8 12h12" />
      <path d="M8 18h12" />
      <path d="M4 6h.01" />
      <path d="M4 12h.01" />
      <path d="M4 18h.01" />
    </svg>
  )
}

function ProfileIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden="true">
      <path d="M18 20a6 6 0 0 0-12 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  )
}

const routeIcons: Partial<Record<DashboardRoute, ComponentType<IconProps>>> = {
  dashboard: DashboardIcon,
  'admin-residents': ProfileIcon,
  'admin-staff': ProfileIcon,
  'admin-requests': RequestIcon,
  'admin-incidents': ReportIcon,
  'admin-logs': LogsIcon,
  'admin-activities': DashboardIcon,
  'admin-archives': ArchiveIcon,
  'request-record': RequestIcon,
  'records-queue': QueueIcon,
  'report-problem': ReportIcon,
  'secretary-requests': RequestIcon,
  'process-request': QueueIcon,
  'secretary-reports': ReportIcon,
  'archive-records': ArchiveIcon,
  'certificate-incident-archives': ArchiveIcon,
  'barangay-record-archives': ArchiveIcon,
  'activity-logs': LogsIcon,
  profile: ProfileIcon,
}

function DashboardLayout({ currentRoute, navItems, children }: DashboardLayoutProps) {
  const { user, logout } = useAuth()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(navItems.filter((item) => item.children?.length).map((item) => [item.label, true])),
  )

  return (
    <section className="relative min-h-screen w-full overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_45%,#f8fafc_100%)]">
      <div className="absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_58%)]" />

      <div className="relative grid min-h-screen lg:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="border-b border-[#d8e2f0] bg-[linear-gradient(180deg,rgba(248,251,255,0.98)_0%,rgba(239,245,255,0.95)_100%)] px-5 py-6 backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-6 lg:py-7">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#2f6df6] text-sm font-bold tracking-[0.18em] text-white shadow-[0_16px_30px_rgba(47,109,246,0.22)]">
              RW
            </div>
            <div>
              <p className="text-sm font-semibold text-[#111827]">RecordWise</p>
              <p className="text-xs text-[#6b7280]">Trusted Records and Archive Workspace</p>
            </div>
          </Link>

          <nav className="mt-8 space-y-2">
            {navItems.map((item) => {
              const isChildActive = item.children?.some((child) => child.route === currentRoute) ?? false
              const isActive = item.route === currentRoute || isChildActive
              const Icon = item.route ? routeIcons[item.route] : undefined
              const isOpen = openGroups[item.label] ?? isChildActive
              const baseClasses = `flex items-center gap-3 rounded-2xl px-4 py-3.5 text-[15px] font-semibold transition ${
                isActive
                  ? 'bg-white text-[#1f5fe0] shadow-[0_12px_32px_rgba(47,109,246,0.12)] ring-1 ring-[#cfe0ff]'
                  : 'text-[#334155] hover:bg-white/85 hover:text-[#0f172a]'
              }`
              const iconClasses = `flex h-10 w-10 items-center justify-center rounded-xl ${
                isActive ? 'bg-[#eaf2ff] text-[#1f5fe0]' : 'bg-white/80 text-[#64748b]'
              }`

              if (item.children?.length) {
                const groupClasses = isOpen
                  ? 'overflow-hidden rounded-[1.6rem] border border-[#d8e2f0] bg-white/90 shadow-[0_14px_30px_rgba(15,23,42,0.06)]'
                  : ''
                const buttonClasses = isOpen
                  ? `${baseClasses} rounded-none border-0 shadow-none ring-0`
                  : `${baseClasses}`

                return (
                  <div key={item.label} className={groupClasses}>
                    <button
                      type="button"
                      onClick={() => setOpenGroups((current) => ({ ...current, [item.label]: !isOpen }))}
                      className={`${buttonClasses} w-full justify-between text-left`}
                    >
                      <span className="flex items-center gap-3">
                        <span className={iconClasses}>{Icon ? <Icon /> : <ArchiveIcon />}</span>
                        <span className="leading-tight">{item.label}</span>
                      </span>
                      <span className={`text-xs transition ${isOpen ? 'rotate-180' : ''}`}>▼</span>
                    </button>

                    {isOpen ? (
                      <div className="border-t border-[#e2e8f0] px-4 pb-4 pt-3">
                        <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">Archive Views</div>
                        <div className="space-y-2">
                          {item.children.map((child) => {
                            const isChildRouteActive = child.route === currentRoute

                            return (
                              <NavLink
                                key={child.label}
                                to={child.href}
                                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                                  isChildRouteActive
                                    ? 'bg-[#f8fbff] text-[#1f5fe0] shadow-[0_10px_26px_rgba(47,109,246,0.08)] ring-1 ring-[#cfe0ff]'
                                    : 'text-[#475569] hover:bg-[#f8fbff] hover:text-[#0f172a]'
                                }`}
                              >
                                <span
                                  className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                                    isChildRouteActive ? 'bg-[#eaf2ff] text-[#1f5fe0]' : 'bg-[#f8fafc] text-[#64748b]'
                                  }`}
                                >
                                  <ArchiveItemIcon />
                                </span>
                                <span className="leading-tight">{child.label}</span>
                              </NavLink>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              }

              return (
                <NavLink key={item.label} to={item.href ?? '/dashboard'} className={baseClasses}>
                  <span className={iconClasses}>{Icon ? <Icon /> : <DashboardIcon />}</span>
                  <span className="leading-tight">{item.label}</span>
                </NavLink>
              )
            })}
          </nav>

          <div className="mt-8 rounded-[1.5rem] border border-[#d8e2f0] bg-white/85 p-4 shadow-[0_14px_30px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">Session</p>
            <p className="mt-3 text-sm font-semibold text-[#111827]">{user?.email ?? 'user@recordwise.app'}</p>
            <p className="mt-1 text-sm text-[#6b7280]">
              {user?.role === 'admin'
                ? 'Admin workspace access is active.'
                : user?.role === 'secretary'
                  ? 'Secretary workspace access is active.'
                  : 'Resident workspace access is active.'}
            </p>
            <button
              type="button"
              onClick={logout}
              className="mt-4 w-full rounded-2xl border border-black/8 bg-[#f8fafc] px-4 py-3 text-sm font-semibold text-[#334155] transition hover:bg-white"
            >
              Sign out
            </button>
          </div>
        </aside>

        <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 xl:px-10">{children}</div>
      </div>
    </section>
  )
}

export default DashboardLayout
