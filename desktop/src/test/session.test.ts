import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiRequest } from '@/lib/api/client'
import { clearRefreshToken, saveRefreshToken } from '@/lib/secureStore'
import { useSessionStore } from '@/stores/session'
import { errorResponse, jsonResponse, makeTokens, makeUser, mockApi } from './fixtures'

vi.mock('@/lib/secureStore', () => ({
  saveRefreshToken: vi.fn(() => Promise.resolve()),
  loadRefreshToken: vi.fn(() => Promise.resolve(null)),
  clearRefreshToken: vi.fn(() => Promise.resolve()),
}))

const REFRESH_PATH = '/api/v1/auth/refresh'

function startSession(remember: boolean) {
  useSessionStore.getState().setSession(makeTokens(makeUser(), 'old'), remember)
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('refresco automático del token', () => {
  beforeEach(() => {
    vi.mocked(saveRefreshToken).mockClear()
    vi.mocked(clearRefreshToken).mockClear()
  })

  it('renueva una sola vez para peticiones concurrentes y las reintenta', async () => {
    startSession(true)
    const requests = mockApi(async (request) => {
      if (request.path === REFRESH_PATH) {
        await delay(20)
        return jsonResponse(makeTokens(makeUser(), 'new'))
      }
      return request.authorization === 'Bearer access-new'
        ? jsonResponse({ path: request.path })
        : errorResponse('auth.unauthorized', 401)
    })

    const results = await Promise.all([
      apiRequest<{ path: string }>('/api/v1/areas'),
      apiRequest<{ path: string }>('/api/v1/users'),
      apiRequest<{ path: string }>('/api/v1/sla-policies'),
    ])

    expect(results.map((result) => result.path)).toEqual([
      '/api/v1/areas',
      '/api/v1/users',
      '/api/v1/sla-policies',
    ])
    const refreshCalls = requests.filter((request) => request.path === REFRESH_PATH)
    expect(refreshCalls).toHaveLength(1)
    expect(refreshCalls[0]?.body).toEqual({ refresh_token: 'refresh-old' })
    expect(useSessionStore.getState()).toMatchObject({
      accessToken: 'access-new',
      refreshToken: 'refresh-new',
    })
    expect(saveRefreshToken).toHaveBeenCalledWith('refresh-new')
  })

  it('reintenta cada petición como máximo una vez', async () => {
    startSession(false)
    const requests = mockApi((request) =>
      request.path === REFRESH_PATH
        ? jsonResponse(makeTokens(makeUser(), 'new'))
        : errorResponse('auth.unauthorized', 401),
    )

    await expect(apiRequest('/api/v1/areas')).rejects.toMatchObject({ status: 401 })

    expect(requests.map((request) => request.path)).toEqual([
      '/api/v1/areas',
      REFRESH_PATH,
      '/api/v1/areas',
    ])
  })

  it('cierra la sesión si la renovación falla', async () => {
    startSession(true)
    mockApi((request) =>
      request.path === REFRESH_PATH
        ? errorResponse('auth.invalid_refresh_token', 401)
        : errorResponse('auth.unauthorized', 401),
    )

    const error = await apiRequest('/api/v1/areas').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 'auth.unauthorized', status: 401 })
    expect(useSessionStore.getState()).toMatchObject({
      status: 'anonymous',
      accessToken: null,
      refreshToken: null,
    })
    expect(clearRefreshToken).toHaveBeenCalled()
  })

  it('no intenta renovar si no hay sesión', async () => {
    const requests = mockApi(() => errorResponse('auth.unauthorized', 401))

    await expect(apiRequest('/api/v1/areas')).rejects.toMatchObject({ status: 401 })

    expect(requests).toHaveLength(1)
    expect(requests[0]?.authorization).toBeNull()
  })
})
