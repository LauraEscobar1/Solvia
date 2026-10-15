import { refreshSession } from '@/lib/auth/session'
import { useSessionStore } from '@/stores/session'
import { type HttpRequestOptions, parseResponse, sendRequest } from './http'

export { ApiError, type ErrorParams } from './http'

export interface ApiRequestOptions extends Omit<HttpRequestOptions, 'accessToken'> {
  auth?: boolean
}

async function tokenAfterUnauthorized(usedToken: string): Promise<string | null> {
  const current = useSessionStore.getState().accessToken
  if (current && current !== usedToken) return current
  const refreshed = await refreshSession()
  return refreshed ? useSessionStore.getState().accessToken : null
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { auth = true, ...requestOptions } = options
  const accessToken = auth ? useSessionStore.getState().accessToken : null
  const response = await sendRequest(path, { ...requestOptions, accessToken })

  if (response.status !== 401 || !accessToken) return parseResponse<T>(response)

  const renewedToken = await tokenAfterUnauthorized(accessToken)
  if (!renewedToken) return parseResponse<T>(response)

  return parseResponse<T>(
    await sendRequest(path, { ...requestOptions, accessToken: renewedToken }),
  )
}
