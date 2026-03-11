import { useState } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import { getWorkspaceNav } from '../navigation'

type Status = {
  type: 'idle' | 'success' | 'error'
  message: string
}

function ProfilePage() {
  const { user, authenticatedFetch, refreshUser } = useAuth()
  const [setupSecret, setSetupSecret] = useState('')
  const [setupUri, setSetupUri] = useState('')
  const [enableCode, setEnableCode] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [status, setStatus] = useState<Status>({ type: 'idle', message: '' })
  const [busyAction, setBusyAction] = useState<'setup' | 'enable' | 'disable' | null>(null)

  async function handleSetup() {
    setBusyAction('setup')
    setStatus({ type: 'idle', message: '' })

    try {
      const response = await authenticatedFetch('/auth/mfa/setup', { method: 'POST' })
      const data = (await response.json().catch(() => null)) as { secret?: string; otpauth_url?: string; detail?: string } | null
      if (!response.ok || !data?.secret || !data.otpauth_url) {
        throw new Error(data?.detail ?? 'Unable to prepare MFA setup')
      }

      setSetupSecret(data.secret)
      setSetupUri(data.otpauth_url)
      setStatus({ type: 'success', message: 'Secret generated. Add it to your authenticator app, then confirm with a code.' })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to prepare MFA setup' })
    } finally {
      setBusyAction(null)
    }
  }

  async function handleEnable() {
    setBusyAction('enable')
    setStatus({ type: 'idle', message: '' })

    try {
      const response = await authenticatedFetch('/auth/mfa/enable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: enableCode.trim() }),
      })
      const data = (await response.json().catch(() => null)) as { message?: string; detail?: string } | null
      if (!response.ok) {
        throw new Error(data?.detail ?? 'Unable to enable MFA')
      }

      setEnableCode('')
      setSetupSecret('')
      setSetupUri('')
      await refreshUser()
      setStatus({ type: 'success', message: data?.message ?? 'MFA has been enabled' })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to enable MFA' })
    } finally {
      setBusyAction(null)
    }
  }

  async function handleDisable() {
    setBusyAction('disable')
    setStatus({ type: 'idle', message: '' })

    try {
      const response = await authenticatedFetch('/auth/mfa/disable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: disableCode.trim() }),
      })
      const data = (await response.json().catch(() => null)) as { message?: string; detail?: string } | null
      if (!response.ok) {
        throw new Error(data?.detail ?? 'Unable to disable MFA')
      }

      setDisableCode('')
      await refreshUser()
      setStatus({ type: 'success', message: data?.message ?? 'MFA has been disabled' })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to disable MFA' })
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <DashboardLayout currentRoute="profile" navItems={getWorkspaceNav(user?.role)}>
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <header className="rounded-[1.75rem] border border-black/6 bg-white/90 px-6 py-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2f6df6]">Profile Settings</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-[#111827]">Account Security</h1>
          <p className="mt-2 text-sm text-[#64748b]">
            {user?.firstName} {user?.middleName} {user?.lastName} from {user?.purok} can manage session security and multi-factor authentication here.
          </p>
        </header>

        <section className="rounded-[1.75rem] border border-black/6 bg-white px-6 py-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-[#111827]">Multi-Factor Authentication</h2>
              <p className="mt-1 text-sm text-[#64748b]">
                Status: <span className="font-semibold text-[#111827]">{user?.mfaEnabled ? 'Enabled' : 'Disabled'}</span>
              </p>
            </div>

            {!user?.mfaEnabled ? (
              <button
                type="button"
                onClick={handleSetup}
                disabled={busyAction === 'setup'}
                className="rounded-2xl bg-[#2f6df6] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#245de0] disabled:opacity-70"
              >
                {busyAction === 'setup' ? 'Preparing...' : 'Set Up MFA'}
              </button>
            ) : null}
          </div>

          {!user?.mfaEnabled && setupSecret ? (
            <div className="mt-6 space-y-4 rounded-3xl border border-[#dbe3f0] bg-[#f8fbff] p-5">
              <div>
                <p className="text-sm font-semibold text-[#111827]">Authenticator secret</p>
                <p className="mt-2 break-all rounded-2xl bg-white px-4 py-3 font-mono text-sm text-[#0f172a]">
                  {setupSecret}
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-[#111827]">OTP URI</p>
                <p className="mt-2 break-all rounded-2xl bg-white px-4 py-3 font-mono text-xs text-[#334155]">
                  {setupUri}
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={enableCode}
                  onChange={(event) => setEnableCode(event.target.value)}
                  placeholder="Enter 6-digit authenticator code"
                  className="flex-1 rounded-2xl border border-[#d8deea] bg-white px-4 py-3 text-sm text-[#111827] outline-none transition focus:border-[#2f6df6] focus:ring-4 focus:ring-[#2f6df6]/10"
                />
                <button
                  type="button"
                  onClick={handleEnable}
                  disabled={busyAction === 'enable'}
                  className="rounded-2xl bg-[#111827] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1f2937] disabled:opacity-70"
                >
                  {busyAction === 'enable' ? 'Enabling...' : 'Enable MFA'}
                </button>
              </div>
            </div>
          ) : null}

          {user?.mfaEnabled ? (
            <div className="mt-6 space-y-4 rounded-3xl border border-[#fee2e2] bg-[#fff7f7] p-5">
              <p className="text-sm text-[#7f1d1d]">
                MFA is active. Enter a valid authenticator code to disable it.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={disableCode}
                  onChange={(event) => setDisableCode(event.target.value)}
                  placeholder="Enter current MFA code"
                  className="flex-1 rounded-2xl border border-[#fecaca] bg-white px-4 py-3 text-sm text-[#111827] outline-none transition focus:border-[#ef4444] focus:ring-4 focus:ring-[#ef4444]/10"
                />
                <button
                  type="button"
                  onClick={handleDisable}
                  disabled={busyAction === 'disable'}
                  className="rounded-2xl bg-[#b91c1c] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#991b1b] disabled:opacity-70"
                >
                  {busyAction === 'disable' ? 'Disabling...' : 'Disable MFA'}
                </button>
              </div>
            </div>
          ) : null}

          {status.type !== 'idle' ? (
            <div
              className={`mt-6 rounded-2xl px-4 py-3 text-sm font-medium ${
                status.type === 'success'
                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border border-rose-200 bg-rose-50 text-rose-700'
              }`}
            >
              {status.message}
            </div>
          ) : null}
        </section>
      </div>
    </DashboardLayout>
  )
}

export default ProfilePage
