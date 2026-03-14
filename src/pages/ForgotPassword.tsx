import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { API_BASE_URL, parseApiJson } from '../lib/api'
import { appRoutes } from '../lib/routes'

type ResetStep = 'request' | 'verify' | 'reset'

function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<ResetStep>('request')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({
    type: 'idle',
    message: '',
  })
  const [busyAction, setBusyAction] = useState<'send' | 'verify' | 'reset' | null>(null)

  async function handleSendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusyAction('send')
    setStatus({ type: 'idle', message: '' })

    try {
      const response = await fetch(`${API_BASE_URL}/auth/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await parseApiJson<{ message?: string; detail?: string }>(response)
      if (!response.ok) {
        throw new Error(data?.detail ?? 'Unable to send reset code')
      }
      setStep('verify')
      setStatus({ type: 'success', message: data?.message ?? 'Password reset code was sent to the email address.' })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to send reset code' })
    } finally {
      setBusyAction(null)
    }
  }

  async function handleVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusyAction('verify')
    setStatus({ type: 'idle', message: '' })

    try {
      const response = await fetch(`${API_BASE_URL}/auth/password-reset/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      })
      const data = await parseApiJson<{ message?: string; detail?: string }>(response)
      if (!response.ok) {
        throw new Error(data?.detail ?? 'Unable to verify OTP')
      }
      setStep('reset')
      setStatus({ type: 'success', message: data?.message ?? 'OTP verified. You can now change your password.' })
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to verify OTP' })
    } finally {
      setBusyAction(null)
    }
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusyAction('reset')
    setStatus({ type: 'idle', message: '' })

    try {
      if (newPassword !== confirmPassword) {
        throw new Error('Passwords do not match')
      }

      const response = await fetch(`${API_BASE_URL}/auth/password-reset/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          code: code.trim(),
          new_password: newPassword,
        }),
      })
      const data = await parseApiJson<{ message?: string; detail?: string }>(response)
      if (!response.ok) {
        throw new Error(data?.detail ?? 'Unable to reset password')
      }

      setStatus({ type: 'success', message: data?.message ?? 'Password reset successful.' })
      window.setTimeout(() => navigate(appRoutes.login), 1200)
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Unable to reset password' })
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 sm:px-6 sm:py-10">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(226,226,226,0.55),_transparent_32%),linear-gradient(180deg,#faf9f7_0%,#f1efea_100%)]" />
      <div className="absolute left-1/2 top-0 -z-10 h-72 w-72 -translate-x-1/2 rounded-full bg-stone-200/40 blur-3xl" />

      <div className="w-full max-w-xl rounded-[2.25rem] border border-black/10 bg-[#111111] p-8 shadow-[0_24px_80px_rgba(17,17,17,0.22)] sm:p-10">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Forgot Password</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400 sm:text-base">
            Reset your password in three steps: request OTP, verify OTP, then change password.
          </p>
        </div>

        <div className="mb-8 grid grid-cols-3 gap-2 text-center text-xs font-semibold uppercase tracking-[0.16em]">
          {[
            { id: 'request', label: 'Request OTP' },
            { id: 'verify', label: 'Verify OTP' },
            { id: 'reset', label: 'Change Password' },
          ].map((item, index) => {
            const isActive = step === item.id
            const isDone =
              (step === 'verify' && index === 0) ||
              (step === 'reset' && (index === 0 || index === 1))
            return (
              <div
                key={item.id}
                className={`rounded-2xl px-3 py-3 ${
                  isActive
                    ? 'bg-[#ece9e2] text-black'
                    : isDone
                      ? 'bg-emerald-500/20 text-emerald-200'
                      : 'border border-white/10 bg-black text-zinc-500'
                }`}
              >
                {item.label}
              </div>
            )
          })}
        </div>

        {step === 'request' ? (
          <form className="space-y-6" onSubmit={handleSendCode}>
            <label className="space-y-2">
              <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-white/78">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter your account email"
                required
                className="w-full rounded-2xl border border-white/12 bg-black px-5 py-4 text-base text-white outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/10 placeholder:text-zinc-400"
              />
            </label>
            <button
              type="submit"
              disabled={busyAction === 'send'}
              className="w-full rounded-2xl bg-[#ece9e2] px-4 py-4 text-base font-semibold text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
            >
              {busyAction === 'send' ? 'Sending OTP...' : 'Send OTP'}
            </button>
          </form>
        ) : null}

        {step === 'verify' ? (
          <form className="space-y-6" onSubmit={handleVerifyCode}>
            <div className="rounded-2xl border border-white/10 bg-black px-5 py-4 text-sm text-zinc-300">
              OTP was sent to <span className="font-semibold text-white">{email}</span>.
            </div>
            <label className="space-y-2">
              <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-white/78">OTP Code</span>
              <input
                type="text"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Enter the OTP from your email"
                required
                className="w-full rounded-2xl border border-white/12 bg-black px-5 py-4 text-base text-white outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/10 placeholder:text-zinc-400"
              />
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep('request')}
                className="w-full rounded-2xl border border-white/12 bg-black px-4 py-4 text-base font-semibold text-white transition hover:bg-zinc-900"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={busyAction === 'verify'}
                className="w-full rounded-2xl bg-[#ece9e2] px-4 py-4 text-base font-semibold text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                {busyAction === 'verify' ? 'Verifying...' : 'Verify OTP'}
              </button>
            </div>
          </form>
        ) : null}

        {step === 'reset' ? (
          <form className="space-y-6" onSubmit={handleResetPassword}>
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-200">
              OTP verified for <span className="font-semibold text-white">{email}</span>.
            </div>
            <label className="space-y-2">
              <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-white/78">New Password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Enter new password"
                required
                className="w-full rounded-2xl border border-white/12 bg-black px-5 py-4 text-base text-white outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/10 placeholder:text-zinc-400"
              />
            </label>
            <label className="space-y-2">
              <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-white/78">Confirm Password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm new password"
                required
                className="w-full rounded-2xl border border-white/12 bg-black px-5 py-4 text-base text-white outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/10 placeholder:text-zinc-400"
              />
            </label>
            <p className="text-sm leading-6 text-zinc-400">
              Password policy: minimum 12 characters with uppercase, lowercase, number, and special character.
            </p>
            <button
              type="submit"
              disabled={busyAction === 'reset'}
              className="w-full rounded-2xl bg-[#ece9e2] px-4 py-4 text-base font-semibold text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
            >
              {busyAction === 'reset' ? 'Changing password...' : 'Change Password'}
            </button>
          </form>
        ) : null}

        {status.type !== 'idle' ? (
          <p
            className={`mt-6 rounded-2xl px-4 py-3 text-sm ${
              status.type === 'success'
                ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border border-red-500/30 bg-red-500/10 text-red-200'
            }`}
          >
            {status.message}
          </p>
        ) : null}

        <p className="mt-8 text-center text-sm text-zinc-400">
          <Link to={appRoutes.login} className="font-medium text-white transition hover:text-zinc-300">
            Back to sign in
          </Link>
        </p>
      </div>
    </section>
  )
}

export default ForgotPasswordPage
