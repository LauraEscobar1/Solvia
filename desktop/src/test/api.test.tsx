import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, apiRequest } from '@/lib/api/client'
import type { HealthResponse } from '@/lib/api/health'
import { SystemStatus } from '@/components/SystemStatus'
import { useSettingsStore } from '@/stores/settings'
import { renderWithProviders } from './render'

function mockFetch(response: Response | Error) {
  const fetchMock = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const HEALTH: HealthResponse = {
  status: 'ok',
  version: '0.1.0',
  environment: 'development',
  database: { status: 'ok' },
  ai: { provider: 'deepseek', model: 'deepseek-flash', configured: true },
}

describe('cliente de API', () => {
  it('usa la URL base configurada', async () => {
    useSettingsStore.setState({ apiBaseUrl: 'http://192.168.1.10:9000' })
    const fetchMock = mockFetch(json({ ok: true }))

    await apiRequest('/api/v1/health')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.1.10:9000/api/v1/health',
      expect.anything(),
    )
  })

  it('convierte el sobre de error del backend en ApiError con código y parámetros', async () => {
    mockFetch(json({ error: { code: 'request.not_found', params: { id: '42' } } }, 404))

    const error = await apiRequest('/x').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 'request.not_found', params: { id: '42' }, status: 404 })
  })

  it('usa common.http_error si la respuesta de error no tiene el formato esperado', async () => {
    mockFetch(new Response('Bad Gateway', { status: 502 }))

    await expect(apiRequest('/x')).rejects.toMatchObject({
      code: 'common.http_error',
      params: { status: 502 },
    })
  })

  it('usa client.network_error si no hay conexión', async () => {
    mockFetch(new TypeError('Failed to fetch'))

    await expect(apiRequest('/x')).rejects.toMatchObject({ code: 'client.network_error' })
  })
})

describe('estado del sistema en Configuración', () => {
  it('muestra el estado de la API, la base de datos y el proveedor de IA', async () => {
    mockFetch(json(HEALTH))
    renderWithProviders(<SystemStatus />)

    expect(await screen.findByText('En línea')).toBeInTheDocument()
    expect(screen.getByText('Operativa')).toBeInTheDocument()
    expect(screen.getByText('DeepSeek')).toBeInTheDocument()
    expect(screen.getByText('deepseek-flash')).toBeInTheDocument()
    expect(screen.getByText('Versión 0.1.0')).toBeInTheDocument()
  })

  it('muestra la API sin conexión con el error traducido', async () => {
    mockFetch(new TypeError('Failed to fetch'))
    renderWithProviders(<SystemStatus />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo conectar con el servidor.',
    )
    expect(screen.getByText('Sin conexión')).toBeInTheDocument()
  })
})
