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

export interface HttpRequestOptions extends Omit<RequestInit, 'signal' | 'body'> {
  baseUrl?: string
  signal?: AbortSignal
  timeoutMs?: number
  body?: unknown
  accessToken?: string | null
}

const DEFAULT_TIMEOUT_MS = 10_000

export async function sendRequest(path: string, options: HttpRequestOptions = {}): Promise<Response> {
  const {
    baseUrl,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    headers,
    body,
    accessToken,
    ...init
  } = options
  const base = baseUrl ?? useSettingsStore.getState().apiBaseUrl
  const requestHeaders = new Headers(headers)
  requestHeaders.set('Accept', 'application/json')
  if (body !== undefined) requestHeaders.set('Content-Type', 'application/json')
  if (accessToken) requestHeaders.set('Authorization', `Bearer ${accessToken}`)
  const timeout = AbortSignal.timeout(timeoutMs)

  try {
    return await fetch(`${base}${path}`, {
      ...init,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ApiError(timeout.aborted ? 'client.timeout' : 'client.network_error')
  }
}

export async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T
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

export async function httpRequest<T>(path: string, options: HttpRequestOptions = {}): Promise<T> {
  return parseResponse<T>(await sendRequest(path, options))
}
