import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

type User = {
  email: string
  firstName?: string
  middleName?: string
  lastName?: string
  purok?: string
  mfaEnabled: boolean
  role: string
}

type LoginOptions = {
  remember?: boolean
  captchaId: string
  captchaAnswer: string
  mfaCode?: string
}

interface AuthContextType {
  isAuthenticated: boolean
  token: string | null
  user: User | null
  login: (email: string, password: string, options: LoginOptions) => Promise<void>
  register: (
    firstName: string,
    middleName: string,
    lastName: string,
    email: string,
    purok: string,
    password: string,
  ) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  authenticatedFetch: (input: string, init?: RequestInit) => Promise<Response>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)
const AUTH_TOKEN_KEY = 'authToken'
const USER_DATA_KEY = 'userData'
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000

type AuthApiResponse = {
  token: string
  expires_at: string
  user: {
    email: string
    first_name?: string
    middle_name?: string
    last_name?: string
    purok?: string
    mfa_enabled?: boolean
    role?: string
  }
}

type UserApiResponse = {
  email: string
  first_name?: string
  middle_name?: string
  last_name?: string
  purok?: string
  mfa_enabled?: boolean
  role?: string
}

function persistAuth(token: string, userData: User, remember = true) {
  const storage = remember ? localStorage : sessionStorage
  const otherStorage = remember ? sessionStorage : localStorage

  otherStorage.removeItem(AUTH_TOKEN_KEY)
  otherStorage.removeItem(USER_DATA_KEY)
  storage.setItem(AUTH_TOKEN_KEY, token)
  storage.setItem(USER_DATA_KEY, JSON.stringify(userData))
}

function clearAuthStorage() {
  localStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem(USER_DATA_KEY)
  sessionStorage.removeItem(AUTH_TOKEN_KEY)
  sessionStorage.removeItem(USER_DATA_KEY)
}

function normalizeUser(user: AuthApiResponse['user'] | UserApiResponse): User {
  return {
    email: user.email,
    firstName: user.first_name,
    middleName: user.middle_name,
    lastName: user.last_name,
    purok: user.purok,
    mfaEnabled: Boolean(user.mfa_enabled),
    role: user.role ?? 'resident',
  }
}

async function parseJson<T>(response: Response): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const inactivityTimerRef = useRef<number | null>(null)
  const tokenRef = useRef<string | null>(null)
  const logoutRef = useRef<() => Promise<void>>(async () => {})

  const resetInactivityTimer = () => {
    if (!isAuthenticated) {
      return
    }

    if (inactivityTimerRef.current) {
      window.clearTimeout(inactivityTimerRef.current)
    }

    inactivityTimerRef.current = window.setTimeout(() => {
      void logoutRef.current()
    }, INACTIVITY_TIMEOUT_MS)
  }

  function clearState() {
    clearAuthStorage()
    tokenRef.current = null
    setToken(null)
    setUser(null)
    setIsAuthenticated(false)
  }

  async function authenticatedFetch(input: string, init: RequestInit = {}) {
    const currentToken = tokenRef.current
    if (!currentToken) {
      throw new Error('Authentication required')
    }

    resetInactivityTimer()

    const headers = new Headers(init.headers ?? {})
    headers.set('Authorization', `Bearer ${currentToken}`)

    const response = await fetch(`${API_BASE_URL}${input}`, {
      ...init,
      headers,
    })

    if (response.status === 401) {
      clearState()
      window.location.hash = '#/login'
      throw new Error('Your session has expired. Please sign in again.')
    }

    resetInactivityTimer()

    return response
  }

  async function refreshUser() {
    const response = await authenticatedFetch('/auth/me')
    const data = await parseJson<UserApiResponse>(response)
    if (!response.ok || !data) {
      throw new Error('Unable to load profile')
    }

    const normalizedUser = normalizeUser(data)
    setUser(normalizedUser)
    const storage = localStorage.getItem(AUTH_TOKEN_KEY) ? localStorage : sessionStorage
    storage.setItem(USER_DATA_KEY, JSON.stringify(normalizedUser))
  }

  async function requestAuth(path: string, payload: Record<string, unknown>) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = (await parseJson<AuthApiResponse | { detail?: string }>(response)) as
      | AuthApiResponse
      | { detail?: string }
      | null

    if (!response.ok) {
      throw new Error(data && 'detail' in data && data.detail ? data.detail : 'Request failed')
    }

    if (!data || !('token' in data) || !('user' in data)) {
      throw new Error('Invalid server response')
    }

    return data
  }

  const logout = async () => {
    const currentToken = tokenRef.current
    if (currentToken) {
      try {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${currentToken}`,
          },
        })
      } catch {
        // Best effort; local logout still proceeds.
      }
    }

    clearState()
    window.location.hash = '#/login'
  }

  useEffect(() => {
    logoutRef.current = logout
  }, [token])

  useEffect(() => {
    tokenRef.current = token
  }, [token])

  useEffect(() => {
    const storedToken = localStorage.getItem(AUTH_TOKEN_KEY) ?? sessionStorage.getItem(AUTH_TOKEN_KEY)
    const storedUser = localStorage.getItem(USER_DATA_KEY) ?? sessionStorage.getItem(USER_DATA_KEY)

    async function restoreSession() {
      if (!storedToken || !storedUser) {
        setLoading(false)
        return
      }

      try {
        const parsedUser = JSON.parse(storedUser) as User
        tokenRef.current = storedToken
        setToken(storedToken)
        setUser(parsedUser)
        setIsAuthenticated(true)
        await refreshUser()
      } catch {
        clearState()
      } finally {
        setLoading(false)
      }
    }

    void restoreSession()
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      if (inactivityTimerRef.current) {
        window.clearTimeout(inactivityTimerRef.current)
        inactivityTimerRef.current = null
      }
      return
    }

    const events: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'click',
      'scroll',
      'touchstart',
      'touchmove',
      'focus',
    ]
    events.forEach((eventName) => window.addEventListener(eventName, resetInactivityTimer))
    document.addEventListener('visibilitychange', resetInactivityTimer)
    resetInactivityTimer()

    return () => {
      if (inactivityTimerRef.current) {
        window.clearTimeout(inactivityTimerRef.current)
        inactivityTimerRef.current = null
      }
      events.forEach((eventName) => window.removeEventListener(eventName, resetInactivityTimer))
      document.removeEventListener('visibilitychange', resetInactivityTimer)
    }
  }, [isAuthenticated])

  const login = async (email: string, password: string, options: LoginOptions) => {
    if (!email || !password) {
      throw new Error('Email and password are required')
    }

    const response = await requestAuth('/auth/login', {
      email,
      password,
      captcha_id: options.captchaId,
      captcha_answer: options.captchaAnswer,
      mfa_code: options.mfaCode?.trim() || undefined,
    })
    const normalizedUser = normalizeUser(response.user)
    persistAuth(response.token, normalizedUser, options.remember ?? true)
    tokenRef.current = response.token
    setToken(response.token)
    setUser(normalizedUser)
    setIsAuthenticated(true)
  }

  const register = async (
    firstName: string,
    middleName: string,
    lastName: string,
    email: string,
    purok: string,
    password: string,
  ) => {
    if (!firstName || !middleName || !lastName || !email || !purok || !password) {
      throw new Error('All fields are required')
    }

    const response = await requestAuth('/auth/register', {
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      email,
      purok,
      password,
    })
    const normalizedUser = normalizeUser(response.user)
    persistAuth(response.token, normalizedUser)
    tokenRef.current = response.token
    setToken(response.token)
    setUser(normalizedUser)
    setIsAuthenticated(true)
  }

  if (loading) {
    return <div className="loading">Loading...</div>
  }

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        token,
        user,
        login,
        register,
        logout,
        refreshUser,
        authenticatedFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
