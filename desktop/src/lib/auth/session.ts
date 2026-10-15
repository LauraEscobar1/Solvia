import { setLanguage } from '@/i18n'
import { ApiError, httpRequest } from '@/lib/api/http'
import type { TokenResponse, User } from '@/lib/api/types'
import { clearRefreshToken, loadRefreshToken, saveRefreshToken } from '@/lib/secureStore'
import { useSessionStore } from '@/stores/session'
import { useThemeStore } from '@/stores/theme'

export interface Credentials {
  email: string
  password: string
  remember: boolean
}

let refreshInFlight: Promise<boolean> | null = null
let restoreInFlight: Promise<void> | null = null

async function ignoreFailure(action: () => Promise<unknown>): Promise<void> {
  try {
    await action()
  } catch {
    return
  }
}

export function applyUserPreferences(user: User): void {
  useThemeStore.getState().setPreference(user.theme)
  void setLanguage(user.language)
}

async function startSession(tokens: TokenResponse, remember: boolean): Promise<void> {
  useSessionStore.getState().setSession(tokens, remember)
  applyUserPreferences(tokens.user)
  if (remember) await ignoreFailure(() => saveRefreshToken(tokens.refresh_token))
}

export async function endSession(): Promise<void> {
  useSessionStore.getState().clear()
  await ignoreFailure(clearRefreshToken)
}

async function performRefresh(): Promise<boolean> {
  const { refreshToken, remember } = useSessionStore.getState()
  if (!refreshToken) {
    await endSession()
    return false
  }
  try {
    const tokens = await httpRequest<TokenResponse>('/api/v1/auth/refresh', {
      method: 'POST',
      body: { refresh_token: refreshToken },
    })
    await startSession(tokens, remember)
    return true
  } catch (error) {
    if (error instanceof ApiError && error.status !== null) await endSession()
    return false
  }
}

export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= performRefresh().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

export async function signIn({ email, password, remember }: Credentials): Promise<User> {
  const tokens = await httpRequest<TokenResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: { email, password },
  })
  await startSession(tokens, remember)
  return tokens.user
}

export async function signOut(): Promise<void> {
  const { refreshToken } = useSessionStore.getState()
  if (refreshToken) {
    await ignoreFailure(() =>
      httpRequest('/api/v1/auth/logout', {
        method: 'POST',
        body: { refresh_token: refreshToken },
      }),
    )
  }
  await endSession()
}

export function restoreSession(): Promise<void> {
  restoreInFlight ??= performRestore()
  return restoreInFlight
}

async function storedRefreshToken(): Promise<string | null> {
  try {
    return await loadRefreshToken()
  } catch {
    return null
  }
}

async function performRestore(): Promise<void> {
  const stored = await storedRefreshToken()
  if (!stored) {
    useSessionStore.getState().clear()
    return
  }
  useSessionStore.setState({ refreshToken: stored, remember: true })
  const restored = await refreshSession()
  if (!restored) useSessionStore.getState().clear()
}
