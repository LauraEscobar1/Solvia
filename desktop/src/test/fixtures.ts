import { vi } from 'vitest'
import type { RequestSummary, TokenResponse, User } from '@/lib/api/types'

export interface RecordedRequest {
  method: string
  path: string
  authorization: string | null
  body: unknown
}

type Handler = (request: RecordedRequest) => Response | Promise<Response>

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function errorResponse(code: string, status: number): Response {
  return jsonResponse({ error: { code, params: {} } }, status)
}

function requestUrl(input: RequestInfo | URL): URL {
  if (typeof input === 'string') return new URL(input)
  if (input instanceof URL) return input
  return new URL(input.url)
}

export function mockApi(handler: Handler): RecordedRequest[] {
  const requests: RecordedRequest[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const request: RecordedRequest = {
        method: init?.method ?? 'GET',
        path: `${url.pathname}${url.search}`,
        authorization: new Headers(init?.headers).get('Authorization'),
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      }
      requests.push(request)
      return handler(request)
    }),
  )
  return requests
}

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    full_name: 'Ana Admin',
    email: 'ana@example.com',
    role: 'admin',
    area: null,
    language: 'es',
    theme: 'system',
    is_active: true,
    must_change_password: false,
    last_login_at: null,
    created_at: '2026-10-15T10:00:00Z',
    updated_at: '2026-10-15T10:00:00Z',
    ...overrides,
  }
}

export function makeTokens(user: User, suffix = '1'): TokenResponse {
  return {
    access_token: `access-${suffix}`,
    token_type: 'bearer',
    expires_in: 1800,
    refresh_token: `refresh-${suffix}`,
    refresh_expires_at: '2026-11-14T10:00:00Z',
    user,
  }
}

export const HEALTH_OK = {
  status: 'ok',
  version: '0.1.0',
  environment: 'development',
  database: { status: 'ok' },
  ai: { provider: 'none', model: null, configured: true },
  organization: { name: null },
}

export const EMPTY_PAGE = { items: [], total: 0, page: 1, size: 10 }

export function makeRequest(overrides: Partial<RequestSummary> = {}): RequestSummary {
  return {
    id: 'req-1',
    code: 'SOL-0001',
    title: 'Impresora sin papel',
    area: { id: 'area-1', name: 'Soporte TI' },
    requester: { id: 'user-2', full_name: 'Carlos' },
    assignee: null,
    priority: 'high',
    status: 'received',
    received_at: '2026-10-10T10:00:00Z',
    due_at: '2026-10-14T18:00:00Z',
    last_activity_at: '2026-10-12T10:00:00Z',
    completed_at: null,
    version: 1,
    sla_status: 'on_track',
    is_stalled: false,
    risk_score: 12,
    ...overrides,
  }
}
