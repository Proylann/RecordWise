import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { API_BASE_URL, parseApiJson } from '../lib/api'
import { appRoutes } from '../lib/routes'

type AuthMode = 'login' | 'register'

type AuthPageLayoutProps = {
  mode: AuthMode
}

function isValidPersonName(value: string) {
  return /^[A-Za-z][A-Za-z\s'.-]*$/.test(value.trim())
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </svg>
  )
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M3 3 21 21" />
      <path d="M10.6 10.7a3 3 0 0 0 4 4" />
      <path d="M9.9 5.1A11.2 11.2 0 0 1 12 5c6.4 0 10 7 10 7a18.8 18.8 0 0 1-4.1 4.8" />
      <path d="M6.7 6.7C4.4 8.1 2.9 10.5 2 12c0 0 3.6 7 10 7 1.8 0 3.4-.5 4.8-1.2" />
    </svg>
  )
}

function AuthPageLayout({ mode }: AuthPageLayoutProps) {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const purokOptions = Array.from({ length: 7 }, (_, index) => `Purok ${index + 1}`)
  const isLogin = mode === 'login'
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [keepLoggedIn, setKeepLoggedIn] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [captchaId, setCaptchaId] = useState('')
  const [captchaQuestion, setCaptchaQuestion] = useState('')
  const [isCaptchaLoading, setIsCaptchaLoading] = useState(false)
  const [formData, setFormData] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    purok: '',
    password: '',
    confirmPassword: '',
    captchaAnswer: '',
  })

  const title = isLogin ? 'Sign in to your account' : 'Create your account'
  const description = isLogin
    ? 'Enter your credentials to access your account.'
    : 'Set up your credentials to access your RecordWise workspace.'

  async function loadCaptcha() {
    setIsCaptchaLoading(true)

    try {
      const response = await fetch(`${API_BASE_URL}/auth/captcha`)
      const data = await parseApiJson<{ captcha_id?: string; question?: string }>(response)

      if (!response.ok || !data?.captcha_id || !data.question) {
        throw new Error('Unable to load captcha')
      }

      setCaptchaId(data.captcha_id)
      setCaptchaQuestion(data.question)
      updateField('captchaAnswer', '')
    } catch {
      setCaptchaId('')
      setCaptchaQuestion('')
    } finally {
      setIsCaptchaLoading(false)
    }
  }

  useEffect(() => {
    if (!isLogin) {
      return
    }

    let cancelled = false

    void (async () => {
      if (!cancelled) {
        await loadCaptcha()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isLogin])

  function updateField(field: keyof typeof formData, value: string) {
    setFormData((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      if (isLogin) {
        const result = await login(formData.email.trim(), formData.password, {
          remember: keepLoggedIn,
          captchaId,
          captchaAnswer: formData.captchaAnswer.trim(),
        })
        if (result.status === 'mfa_required') {
          navigate(appRoutes.loginVerify)
          return
        }
      } else {
        if (formData.password !== formData.confirmPassword) {
          throw new Error('Passwords do not match')
        }

        if (!isValidPersonName(formData.firstName)) {
          throw new Error('First name may only contain letters, spaces, apostrophes, periods, and hyphens')
        }

        if (!isValidPersonName(formData.middleName)) {
          throw new Error('Middle name may only contain letters, spaces, apostrophes, periods, and hyphens')
        }

        if (!isValidPersonName(formData.lastName)) {
          throw new Error('Last name may only contain letters, spaces, apostrophes, periods, and hyphens')
        }

        await register(
          formData.firstName.trim(),
          formData.middleName.trim(),
          formData.lastName.trim(),
          formData.email.trim(),
          formData.purok,
          formData.password,
        )
      }

      navigate(appRoutes.dashboard)
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Unable to continue'
      setError(message)
      if (isLogin) {
        await loadCaptcha()
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  function renderInput(
    field: keyof typeof formData,
    label: string,
    placeholder: string,
    type = 'text',
    canToggle = false,
    required = true,
  ) {
    const isPasswordField = field === 'password'
    const revealed = isPasswordField ? showPassword : showConfirmPassword

    return (
      <label className="space-y-2" key={field}>
        <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-white/78">{label}</span>
        <div className="relative">
          <input
            type={canToggle ? (revealed ? 'text' : 'password') : type}
            value={formData[field]}
            onChange={(event) => updateField(field, event.target.value)}
            placeholder={placeholder}
            required={required}
            inputMode={field === 'email' ? 'email' : 'text'}
            className="w-full rounded-2xl border border-white/12 bg-black px-5 py-4 text-base text-white outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/10 placeholder:text-base placeholder:text-zinc-400 sm:text-lg sm:placeholder:text-lg"
          />
          {canToggle && (
            <button
              type="button"
              onClick={() =>
                isPasswordField ? setShowPassword((value) => !value) : setShowConfirmPassword((value) => !value)
              }
              className="absolute inset-y-0 right-0 flex items-center pr-5 text-zinc-500 transition hover:text-zinc-300"
              aria-label={revealed ? 'Hide password' : 'Show password'}
            >
              <EyeIcon open={revealed} />
            </button>
          )}
        </div>
      </label>
    )
  }

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 sm:px-6 sm:py-10">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(226,226,226,0.55),_transparent_32%),linear-gradient(180deg,#faf9f7_0%,#f1efea_100%)]" />
      <div className="absolute left-1/2 top-0 -z-10 h-72 w-72 -translate-x-1/2 rounded-full bg-stone-200/40 blur-3xl" />

      <div className="w-full max-w-xl rounded-[2.25rem] border border-black/10 bg-[#111111] p-8 shadow-[0_24px_80px_rgba(17,17,17,0.22)] sm:p-10">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-6 flex h-18 w-18 items-center justify-center rounded-full border border-white/10 bg-zinc-800 text-zinc-300">
            <UserIcon />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-zinc-400 sm:text-base">{description}</p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          {!isLogin && (
            <div className="grid gap-5 sm:grid-cols-2">
              {renderInput('firstName', 'First Name', 'Enter first name')}
              {renderInput('middleName', 'Middle Name', 'Enter middle name')}
              {renderInput('lastName', 'Last Name', 'Enter last name')}
              <label className="space-y-2">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-white/78">Purok</span>
                <select
                  value={formData.purok}
                  onChange={(event) => updateField('purok', event.target.value)}
                  required
                  className="w-full rounded-2xl border border-white/12 bg-black px-5 py-4 text-base text-white outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/10"
                >
                  <option value="">Select purok</option>
                  {purokOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {renderInput('email', 'Email', 'Enter your email', 'email')}
          {renderInput('password', 'Password', isLogin ? 'Enter your password' : 'Create a password', 'password', true)}
          {isLogin && (
            <div className="space-y-3">
              <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-white/78">
                Captcha
              </span>
              <div className="rounded-2xl border border-white/12 bg-black px-5 py-4 text-base text-white">
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium tracking-[0.08em] text-zinc-100">
                    {isCaptchaLoading ? 'Loading captcha...' : captchaQuestion || 'Captcha unavailable'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void loadCaptcha()}
                    disabled={isCaptchaLoading}
                    className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Refresh
                  </button>
                </div>
              </div>
              {renderInput('captchaAnswer', 'Captcha Answer', 'Solve the captcha')}
            </div>
          )}
          {!isLogin &&
            renderInput('confirmPassword', 'Confirm Password', 'Confirm your password', 'password', true)}

          {isLogin ? (
            <div className="flex items-center justify-between gap-4 text-sm">
              <label className="flex items-center gap-3 text-zinc-300">
                <input
                  type="checkbox"
                  checked={keepLoggedIn}
                  onChange={(event) => setKeepLoggedIn(event.target.checked)}
                  className="h-4 w-4 appearance-none rounded-full border border-zinc-500 bg-transparent checked:border-zinc-100 checked:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
                />
                <span>Keep me logged in</span>
              </label>

              <Link to={appRoutes.forgotPassword} className="text-zinc-400 transition hover:text-white">
                Forgot password?
              </Link>
            </div>
          ) : (
            <p className="text-sm leading-6 text-zinc-400">
              Password policy: minimum 12 characters with uppercase, lowercase, number, and special character.
            </p>
          )}

          {error && (
            <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-2xl bg-[#ece9e2] px-4 py-4 text-base font-semibold text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? 'Please wait...' : 'Continue'}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-zinc-400">
          {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
          <Link
            to={isLogin ? appRoutes.register : appRoutes.login}
            className="font-medium text-white transition hover:text-zinc-300"
          >
            {isLogin ? 'Register' : 'Sign in'}
          </Link>
        </p>
      </div>
    </section>
  )
}

export default AuthPageLayout
