import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { appRoutes } from '../lib/routes'

function LoginVerificationPage() {
  const navigate = useNavigate()
  const { pendingLogin, verifyPendingLogin, clearPendingLogin } = useAuth()
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<{ type: 'idle' | 'error'; message: string }>({
    type: 'idle',
    message: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!pendingLogin) {
    return <Navigate to={appRoutes.login} replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setStatus({ type: 'idle', message: '' })

    try {
      await verifyPendingLogin(code)
      navigate(appRoutes.dashboard)
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to verify code',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleBack() {
    clearPendingLogin()
    navigate(appRoutes.login)
  }

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 sm:px-6 sm:py-10">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(226,226,226,0.55),_transparent_32%),linear-gradient(180deg,#faf9f7_0%,#f1efea_100%)]" />
      <div className="absolute left-1/2 top-0 -z-10 h-72 w-72 -translate-x-1/2 rounded-full bg-stone-200/40 blur-3xl" />

      <div className="w-full max-w-xl rounded-[2.25rem] border border-black/10 bg-[#111111] p-8 shadow-[0_24px_80px_rgba(17,17,17,0.22)] sm:p-10">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Verify Sign In</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400 sm:text-base">
            Enter the verification code sent to <span className="font-semibold text-white">{pendingLogin.email}</span>.
          </p>
        </div>
        <form className="space-y-6" onSubmit={handleSubmit}>
          <label className="space-y-2">
            <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-white/78">OTP Code</span>
            <input
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Enter the code from your email"
              required
              className="w-full rounded-2xl border border-white/12 bg-black px-5 py-4 text-base text-white outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/10 placeholder:text-zinc-400"
            />
          </label>

          {status.type === 'error' ? (
            <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {status.message}
            </p>
          ) : null}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="w-full rounded-2xl border border-white/12 bg-black px-4 py-4 text-base font-semibold text-white transition hover:bg-zinc-900"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-2xl bg-[#ece9e2] px-4 py-4 text-base font-semibold text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? 'Verifying...' : 'Verify OTP'}
            </button>
          </div>
        </form>

        <p className="mt-8 text-center text-sm text-zinc-400">
          <Link to={appRoutes.login} className="font-medium text-white transition hover:text-zinc-300">
            Back to sign in
          </Link>
        </p>
      </div>
    </section>
  )
}

export default LoginVerificationPage
