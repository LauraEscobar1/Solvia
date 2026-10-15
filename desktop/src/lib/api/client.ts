import { useSettingsStore } from '@/stores/settings'

export type ErrorParams = Record<string, unknown>

export class ApiError extends Error {
  readonly code: string
  readonly params: ErrorParams
  readonly status: number | null

  constructor(code: string, params: ErrorParams = {}, status: number | null = null) {
    super(code)
    this.name = 'ApiError'
    this.code = code
    this.params = params
    this.status = status
  }
}

interface ErrorEnvelope {
  error: { code: string; params?: ErrorParams }
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false
  const { error } = value
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  )
}

export interface ApiRequestOptions extends Omit<RequestInit, 'signal'> {
  baseUrl?: string
  signal?: AbortSignal
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 10_000

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { baseUrl, signal, timeoutMs = DEFAULT_TIMEOUT_MS, headers, ...init } = options
  const base = baseUrl ?? useSettingsStore.getState().apiBaseUrl
  const requestHeaders = new Headers(headers)
  requestHeaders.set('Accept', 'application/json')
  const timeout = AbortSignal.timeout(timeoutMs)

  let response: Response
  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      headers: requestHeaders,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    const timedOut = timeout.aborted
    throw new ApiError(timedOut ? 'client.timeout' : 'client.network_error')
  }

  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    if (isErrorEnvelope(body)) {
      throw new ApiError(body.error.code, body.error.params ?? {}, response.status)
    }
    throw new ApiError('common.http_error', { status: response.status }, response.status)
  }
  if (body === null) throw new ApiError('client.invalid_response', {}, response.status)
  return body as T
}
