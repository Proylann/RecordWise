import { useState } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import { parseApiJson } from '../lib/api'
import { getWorkspaceNav } from '../navigation'

type Status = {
  type: 'idle' | 'success' | 'error'
  message: string
}

type BusyAction = 'profile' | 'password' | 'setup' | 'enable' | 'disable-request' | 'disable' | null

function ProfilePage() {
  const { user, authenticatedFetch, refreshUser } = useAuth()
  const [profileForm, setProfileForm] = useState({
    firstName: user?.firstName ?? '',
    middleName: user?.middleName ?? '',
    lastName: user?.lastName ?? '',
  })
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [enableCode, setEnableCode] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [status, setStatus] = useState<Status>({ type: 'idle', message: '' })
  const [busyAction, setBusyAction] = useState<BusyAction>(null)

  const mfaRequired = Boolean(user?.mfaEnabled)
  const isSecretary = user?.role === 'secretary'

  async function handleProfileSave() {
    setBusyAction('profile')
    setStatus({ type: 'idle', message: '' })

    try {
      const response = await authenticatedFetch('/auth/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          first_name: profileForm.firstName,
          middle_name: profileForm.middleName,
          last_name: profileForm.lastName,
        }),
      })
      const data = await parseApiJson<{ detail?: string }>(response)
      if (!response.ok) {
        throw new Error(data?.detail ?? 'Unable to update profile')
      }

      await refreshUser()
      setStatus({ type: 'success', message: 'Profile details updated.' })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to update profile' })
    } finally {
      setBusyAction(null)
    }
  }

  async function handlePasswordChange() {
    setBusyAction('password')
    setStatus({ type: 'idle', message: '' })

    try {
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        throw new Error('New passwords do not match')
      }

      const response = await authenticatedFetch('/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          current_password: passwordForm.currentPassword,
          new_password: passwordForm.newPassword,
        }),
      })
      const data = await parseApiJson<{ message?: string; detail?: string }>(response)
      if (!response.ok) {
        throw new Error(data?.detail ?? 'Unable to change password')
      }

      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setStatus({ type: 'success', message: data?.message ?? 'Password updated successfully' })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to change password' })
    } finally {
      setBusyAction(null)
    }
  }

  async function handleSetup() {
    setBusyAction('setup')
    setStatus({ type: 'idle', message: '' })

    try {
      const response = await authenticatedFetch('/auth/mfa/setup', { method: 'POST' })
      const data = await parseApiJson<{ message?: string; detail?: string }>(response)
      if (!response.ok) {
        throw new Error(data?.detail ?? 'Unable to send MFA code')
      }

      setStatus({ type: 'success', message: data?.message ?? 'A verification code was sent to your email address.' })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to send MFA code' })
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
      const data = await parseApiJson<{ message?: string; detail?: string }>(response)
      if (!response.ok) {
        throw new Error(data?.detail ?? 'Unable to enable MFA')
      }

      setEnableCode('')
      await refreshUser()
      setStatus({ type: 'success', message: data?.message ?? 'MFA has been enabled' })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to enable MFA' })
    } finally {
      setBusyAction(null)
    }
  }

  async function handleDisableRequest() {
    setBusyAction('disable-request')
    setStatus({ type: 'idle', message: '' })

    try {
      const response = await authenticatedFetch('/auth/mfa/disable/request', { method: 'POST' })
      const data = await parseApiJson<{ message?: string; detail?: string }>(response)
      if (!response.ok) {
        throw new Error(data?.detail ?? 'Unable to send disable code')
      }

      setStatus({ type: 'success', message: data?.message ?? 'A verification code was sent to your email address.' })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to send disable code' })
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
      const data = await parseApiJson<{ message?: string; detail?: string }>(response)
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
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="rounded-[1.75rem] border border-black/6 bg-white/90 px-6 py-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2f6df6]">Profile Settings</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-[#111827]">Account Settings</h1>
          <p className="mt-2 text-sm text-[#64748b]">
            Update your account name, password, and email-based OTP settings.
          </p>
        </header>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-[1.75rem] border border-black/6 bg-white px-6 py-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
            <h2 className="text-xl font-semibold text-[#111827]">Profile Information</h2>
            <div className="mt-5 grid gap-4">
              <input
                value={profileForm.firstName}
                onChange={(event) => setProfileForm((current) => ({ ...current, firstName: event.target.value }))}
                placeholder="First name"
                className="rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3.5 text-sm text-[#111827] outline-none"
              />
              <input
                value={profileForm.middleName}
                onChange={(event) => setProfileForm((current) => ({ ...current, middleName: event.target.value }))}
                placeholder="Middle name"
                className="rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3.5 text-sm text-[#111827] outline-none"
              />
              <input
                value={profileForm.lastName}
                onChange={(event) => setProfileForm((current) => ({ ...current, lastName: event.target.value }))}
                placeholder="Last name"
                className="rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3.5 text-sm text-[#111827] outline-none"
              />
              <div className="rounded-2xl border border-[#dbe3f0] bg-[#f8fbff] px-4 py-3 text-sm text-[#475569]">
                Email: <span className="font-semibold text-[#111827]">{user?.email}</span>
              </div>
              <div className="rounded-2xl border border-[#dbe3f0] bg-[#f8fbff] px-4 py-3 text-sm text-[#475569]">
                Role: <span className="font-semibold capitalize text-[#111827]">{user?.role}</span>
              </div>
              <button
                type="button"
                onClick={() => void handleProfileSave()}
                disabled={busyAction === 'profile'}
                className="rounded-2xl bg-[#2f6df6] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#245de0] disabled:opacity-70"
              >
                {busyAction === 'profile' ? 'Saving...' : 'Save profile'}
              </button>
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-black/6 bg-white px-6 py-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
            <h2 className="text-xl font-semibold text-[#111827]">Change Password</h2>
            <div className="mt-5 grid gap-4">
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
                placeholder="Current password"
                className="rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3.5 text-sm text-[#111827] outline-none"
              />
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                placeholder="New password"
                className="rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3.5 text-sm text-[#111827] outline-none"
              />
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                placeholder="Confirm new password"
                className="rounded-2xl border border-[#d8deea] bg-[#fcfdff] px-4 py-3.5 text-sm text-[#111827] outline-none"
              />
              <p className="text-sm text-[#64748b]">
                Minimum 12 characters with uppercase, lowercase, number, and special character.
              </p>
              <button
                type="button"
                onClick={() => void handlePasswordChange()}
                disabled={busyAction === 'password'}
                className="rounded-2xl bg-[#111827] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1f2937] disabled:opacity-70"
              >
                {busyAction === 'password' ? 'Updating...' : 'Change password'}
              </button>
            </div>
          </section>
        </div>

          <section className="rounded-[1.75rem] border border-black/6 bg-white px-6 py-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
              <h2 className="text-xl font-semibold text-[#111827]">Email OTP</h2>
              <p className="mt-1 text-sm text-[#64748b]">
                Status: <span className="font-semibold text-[#111827]">{mfaRequired ? 'Enabled' : 'Disabled'}</span>
              </p>
              {isSecretary ? (
                <p className="mt-1 text-sm text-[#64748b]">Secretary accounts are required to keep OTP enabled.</p>
              ) : null}
            </div>

            {!user?.mfaEnabled ? (
              <button
                type="button"
                onClick={() => void handleSetup()}
                disabled={busyAction === 'setup'}
                className="rounded-2xl bg-[#2f6df6] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#245de0] disabled:opacity-70"
              >
                {busyAction === 'setup' ? 'Sending...' : 'Send OTP code'}
              </button>
            ) : null}
          </div>

          {!user?.mfaEnabled ? (
            <div className="mt-6 space-y-4 rounded-3xl border border-[#dbe3f0] bg-[#f8fbff] p-5">
              <p className="text-sm text-[#475569]">
                OTP uses a verification code sent to your email address.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={enableCode}
                  onChange={(event) => setEnableCode(event.target.value)}
                  placeholder="Enter emailed verification code"
                  className="flex-1 rounded-2xl border border-[#d8deea] bg-white px-4 py-3 text-sm text-[#111827] outline-none transition focus:border-[#2f6df6] focus:ring-4 focus:ring-[#2f6df6]/10"
                />
                <button
                  type="button"
                  onClick={() => void handleEnable()}
                  disabled={busyAction === 'enable'}
                  className="rounded-2xl bg-[#111827] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1f2937] disabled:opacity-70"
                >
                  {busyAction === 'enable' ? 'Enabling...' : 'Enable OTP'}
                </button>
              </div>
            </div>
          ) : null}

          {user?.mfaEnabled ? (
            <div className="mt-6 space-y-4 rounded-3xl border border-[#fee2e2] bg-[#fff7f7] p-5">
              {isSecretary ? (
                <p className="text-sm text-[#7f1d1d]">OTP is enforced for secretary accounts and cannot be disabled.</p>
              ) : (
                <>
                  <p className="text-sm text-[#7f1d1d]">
                    Send a verification code to your email address, then enter it below to disable OTP.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void handleDisableRequest()}
                      disabled={busyAction === 'disable-request'}
                      className="rounded-2xl border border-[#fecaca] bg-white px-5 py-3 text-sm font-semibold text-[#b91c1c] transition hover:bg-[#fff1f1] disabled:opacity-70"
                    >
                      {busyAction === 'disable-request' ? 'Sending...' : 'Send disable code'}
                    </button>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      type="text"
                      value={disableCode}
                      onChange={(event) => setDisableCode(event.target.value)}
                      placeholder="Enter emailed verification code"
                      className="flex-1 rounded-2xl border border-[#fecaca] bg-white px-4 py-3 text-sm text-[#111827] outline-none transition focus:border-[#ef4444] focus:ring-4 focus:ring-[#ef4444]/10"
                    />
                    <button
                      type="button"
                      onClick={() => void handleDisable()}
                      disabled={busyAction === 'disable'}
                      className="rounded-2xl bg-[#b91c1c] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#991b1b] disabled:opacity-70"
                    >
                      {busyAction === 'disable' ? 'Disabling...' : 'Disable OTP'}
                    </button>
                  </div>
                </>
              )}
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
