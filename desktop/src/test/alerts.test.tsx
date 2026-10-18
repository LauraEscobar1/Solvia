import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CriticalAlertNotifier } from '@/components/alerts/CriticalAlertNotifier'
import { NotificationSettings } from '@/components/alerts/NotificationSettings'
import { TopBar } from '@/components/layout/TopBar'
import type { Alert } from '@/lib/api/types'
import { AlertsPage } from '@/pages/alerts/AlertsPage'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore } from '@/stores/settings'
import { jsonResponse, makeTokens, makeUser, mockApi } from './fixtures'

const notifications = vi.hoisted(() => ({
  available: true,
  granted: true,
  notify: vi.fn(),
}))

vi.mock('@/lib/alerts/notifications', () => ({
  nativeNotificationsAvailable: () => notifications.available,
  ensureNotificationPermission: () => Promise.resolve(notifications.granted),
  notify: notifications.notify,
}))

vi.mock('@/lib/secureStore', () => ({
  saveRefreshToken: vi.fn(() => Promise.resolve()),
  loadRefreshToken: vi.fn(() => Promise.resolve(null)),
  clearRefreshToken: vi.fn(() => Promise.resolve()),
}))

const SUPPORT = { id: 'area-1', name: 'Soporte TI' }

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 'alert-1',
    type: 'stalled',
    severity: 'critical',
    source: 'rule',
    message_code: 'alert.stalled',
    params: {
      code: 'SOL-0042',
      status: 'in_progress',
      idle_since: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
      threshold_hours: 2,
    },
    area: SUPPORT,
    request: { id: 'req-42', code: 'SOL-0042', title: 'Acceso VPN', status: 'in_progress' },
    is_read: false,
    created_at: new Date(Date.now() - 600 * 1000).toISOString(),
    resolved_at: null,
    ...overrides,
  }
}

const BOTTLENECK = makeAlert({
  id: 'alert-2',
  type: 'bottleneck',
  severity: 'warning',
  message_code: 'alert.bottleneck',
  params: { area_id: 'area-1', status: 'received', count: 7, avg_hours: 89.9, reasons: [] },
  request: null,
  is_read: true,
})

function renderWithRouter(element: React.ReactElement, path = '/alerts') {
  useSessionStore.getState().setSession(makeTokens(makeUser()), false)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/alerts', element },
      { path: '/requests', element: <p>lista</p> },
      { path: '/requests/:id', element: <p>detalle</p> },
    ],
    { initialEntries: [path] },
  )
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, queryClient }
}

describe('alertas en la aplicación', () => {
  beforeEach(() => {
    notifications.available = true
    notifications.granted = true
    notifications.notify.mockReset()
  })

  it('la navegación muestra el contador de no leídas junto a Alertas', async () => {
    mockApi((request) =>
      request.path === '/api/v1/alerts/unread-count'
        ? jsonResponse({ count: 7 })
        : jsonResponse({ items: [], total: 0, page: 1, size: 20 }),
    )
    renderWithRouter(<TopBar />)

    const link = await screen.findByRole('link', { name: 'Alertas (7 sin leer)' })

    expect(link).toHaveAttribute('href', '/alerts')
    expect(link).toHaveAttribute('aria-current', 'page')
    expect(within(link).getByText('7')).toBeInTheDocument()
  })

  it('sin alertas pendientes no hay contador', async () => {
    mockApi(() => jsonResponse({ count: 0 }))
    renderWithRouter(<TopBar />)

    expect(await screen.findByRole('link', { name: 'Alertas' })).toBeInTheDocument()
    expect(screen.queryByText(/sin leer/)).toBeNull()
  })

  it('construye el texto de cada alerta desde message_code y params', async () => {
    mockApi(() => jsonResponse({ items: [makeAlert(), BOTTLENECK], total: 2, page: 1, size: 20 }))
    renderWithRouter(<AlertsPage />)

    expect(
      await screen.findByText(
        'SOL-0042 no tiene actividad desde hace 3 horas en «En proceso» (umbral: 2 h).',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Cuello de botella en Soporte TI · Recibida: 7 solicitudes con 3,7 d de promedio en la etapa.',
      ),
    ).toBeInTheDocument()
  })

  it('usa el idioma activo para los mensajes', async () => {
    const { default: i18n } = await import('@/i18n')
    await i18n.changeLanguage('en')
    mockApi(() => jsonResponse({ items: [BOTTLENECK], total: 1, page: 1, size: 20 }))
    renderWithRouter(<AlertsPage />)

    expect(
      await screen.findByText(
        'Bottleneck in Soporte TI · Received: 7 requests averaging 3.7 d in the stage.',
      ),
    ).toBeInTheDocument()
  })

  it('enlaza a la solicitud o, en un cuello de botella, a la lista por área y etapa', async () => {
    mockApi(() => jsonResponse({ items: [makeAlert(), BOTTLENECK], total: 2, page: 1, size: 20 }))
    renderWithRouter(<AlertsPage />)

    expect(await screen.findByRole('link', { name: 'Ver solicitud' })).toHaveAttribute(
      'href',
      '/requests/req-42',
    )
    expect(screen.getByRole('link', { name: 'Ver solicitudes' })).toHaveAttribute(
      'href',
      '/requests?status=received&area_id=area-1',
    )
  })

  it('marca una alerta y todas como leídas', async () => {
    const requests = mockApi((request) => {
      if (request.method === 'PATCH') return jsonResponse({ ...makeAlert(), is_read: true })
      if (request.path === '/api/v1/alerts/read-all') return jsonResponse({ count: 3 })
      return jsonResponse({ items: [makeAlert()], total: 1, page: 1, size: 20 })
    })
    const user = userEvent.setup()
    renderWithRouter(<AlertsPage />)

    await user.click(await screen.findByRole('button', { name: 'Marcar como leída' }))
    await user.click(screen.getByRole('button', { name: 'Marcar todas como leídas' }))

    expect(await screen.findByText('3 alertas marcadas como leídas.')).toBeInTheDocument()
    expect(requests.some((request) => request.method === 'PATCH' && request.path === '/api/v1/alerts/alert-1/read')).toBe(true)
    expect(requests.some((request) => request.method === 'POST' && request.path === '/api/v1/alerts/read-all')).toBe(true)
  })

  it('envía los filtros de tipo, severidad, estado y lectura a la API', async () => {
    const requests = mockApi(() => jsonResponse({ items: [], total: 0, page: 1, size: 20 }))
    const user = userEvent.setup()
    const { router } = renderWithRouter(<AlertsPage />)

    await user.click(await screen.findByRole('button', { name: 'Cuello de botella' }))
    await user.click(screen.getByRole('button', { name: 'Crítica' }))
    await user.click(screen.getByRole('radio', { name: 'Resueltas' }))
    await user.click(screen.getByRole('radio', { name: 'No leídas' }))

    const last = requests.at(-1)
    expect(last?.path).toContain('type=bottleneck')
    expect(last?.path).toContain('severity=critical')
    expect(last?.path).toContain('state=resolved')
    expect(last?.path).toContain('is_read=false')
    expect(router.state.location.search).toContain('state=resolved')
  })

  it('notifica solo las alertas críticas nuevas cuando el usuario lo activa', async () => {
    useSettingsStore.setState({ criticalNotifications: true })
    let items = [makeAlert()]
    mockApi(() => jsonResponse({ items, total: items.length, page: 1, size: 50 }))
    const { queryClient } = renderWithRouter(<CriticalAlertNotifier />)

    await vi.waitFor(() => {
      expect(queryClient.getQueryData(['alerts', 'critical'])).toBeDefined()
    })
    expect(notifications.notify).not.toHaveBeenCalled()

    items = [makeAlert(), makeAlert({ id: 'alert-9', params: { code: 'SOL-0099', due_at: new Date(Date.now() - 3600 * 1000).toISOString() }, type: 'overdue', message_code: 'alert.overdue' })]
    await act(() => queryClient.refetchQueries({ queryKey: ['alerts', 'critical'] }))

    await vi.waitFor(() => {
      expect(notifications.notify).toHaveBeenCalledTimes(1)
    })
    expect(notifications.notify).toHaveBeenCalledWith(
      'Alerta crítica en Solvia',
      'SOL-0099 venció hace 1 hora.',
    )
  })

  it('no consulta ni notifica con las notificaciones desactivadas (valor por defecto)', async () => {
    const requests = mockApi(() => jsonResponse({ items: [makeAlert()], total: 1, page: 1, size: 50 }))
    renderWithRouter(<CriticalAlertNotifier />)

    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(useSettingsStore.getState().criticalNotifications).toBe(false)
    expect(requests).toHaveLength(0)
    expect(notifications.notify).not.toHaveBeenCalled()
  })

  it('el interruptor de notificaciones empieza apagado y pide permiso al activarlo', async () => {
    const user = userEvent.setup()
    renderWithRouter(<NotificationSettings />)

    const toggle = screen.getByLabelText('Notificar alertas críticas nuevas')
    expect(toggle).not.toBeChecked()
    await user.click(toggle)

    expect(toggle).toBeChecked()
    expect(useSettingsStore.getState().criticalNotifications).toBe(true)
  })

  it('si el sistema niega el permiso, el interruptor queda apagado con un aviso', async () => {
    notifications.granted = false
    const user = userEvent.setup()
    renderWithRouter(<NotificationSettings />)

    await user.click(screen.getByLabelText('Notificar alertas críticas nuevas'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El sistema no concedió permiso para mostrar notificaciones.',
    )
    expect(useSettingsStore.getState().criticalNotifications).toBe(false)
  })

  it('fuera de la app de escritorio el interruptor está deshabilitado', () => {
    notifications.available = false
    renderWithRouter(<NotificationSettings />)

    expect(screen.getByLabelText('Notificar alertas críticas nuevas')).toBeDisabled()
    expect(
      screen.getByText(
        'Las notificaciones nativas solo están disponibles en la aplicación de escritorio.',
      ),
    ).toBeInTheDocument()
  })
})
