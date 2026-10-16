import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  BottleneckMatrix,
  DashboardSummary,
  RequestHighlights,
  StatusBreakdown,
  TrendSeries,
  User,
} from '@/lib/api/types'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { RequestsPage } from '@/pages/requests/RequestsPage'
import { useSessionStore } from '@/stores/session'
import { EMPTY_PAGE, jsonResponse, makeTokens, makeUser, mockApi } from './fixtures'

vi.mock('@/lib/secureStore', () => ({
  saveRefreshToken: vi.fn(() => Promise.resolve()),
  loadRefreshToken: vi.fn(() => Promise.resolve(null)),
  clearRefreshToken: vi.fn(() => Promise.resolve()),
}))

const RANGE = { date_from: '2026-09-16', date_to: '2026-10-15', timezone: 'America/Bogota' }

const SUMMARY: DashboardSummary = {
  open: 36,
  due_soon: 4,
  overdue: 5,
  stalled: 7,
  completed_last_7_days: 17,
  completed_since: '2026-10-09',
  avg_resolution_hours: 61.4,
  range: RANGE,
}

const BY_STATUS: StatusBreakdown = {
  items: [
    { status: 'received', count: 10 },
    { status: 'assigned', count: 10 },
    { status: 'in_progress', count: 16 },
    { status: 'completed', count: 58 },
    { status: 'cancelled', count: 12 },
  ],
  range: RANGE,
}

const TRENDS: TrendSeries = {
  days: [
    { day: '2026-10-14', created: 4, completed: 3 },
    { day: '2026-10-15', created: 6, completed: 2 },
  ],
  range: RANGE,
}

const SUPPORT = { id: 'area-1', name: 'Soporte TI' }

const BOTTLENECKS: BottleneckMatrix = {
  cells: [
    {
      area: SUPPORT,
      status: 'received',
      count: 7,
      avg_hours: 89.9,
      median_count: 3,
      median_avg_hours: 88.4,
      sla_max_hours: 20.6,
      is_bottleneck: true,
      reasons: ['count_above_median', 'avg_above_sla'],
    },
    {
      area: SUPPORT,
      status: 'assigned',
      count: 4,
      avg_hours: 5.5,
      median_count: 4.5,
      median_avg_hours: 47.6,
      sla_max_hours: 34,
      is_bottleneck: false,
      reasons: [],
    },
    {
      area: SUPPORT,
      status: 'in_progress',
      count: 9,
      avg_hours: 44,
      median_count: 10,
      median_avg_hours: 110.5,
      sla_max_hours: 149.3,
      is_bottleneck: false,
      reasons: [],
    },
  ],
}

const AT_RISK: RequestHighlights = {
  items: [
    {
      id: 'req-9',
      code: 'SOL-0092',
      title: 'Acceso VPN',
      area: SUPPORT,
      assignee: null,
      priority: 'critical',
      status: 'received',
      due_at: '2026-10-14T10:00:00Z',
      last_activity_at: '2026-10-15T10:00:00Z',
      sla_status: 'overdue',
      consumed_pct: 156,
      idle_hours: 2,
      inactivity_hours: 2,
    },
  ],
}

const RESOURCES: Record<string, unknown> = {
  summary: SUMMARY,
  'by-status': BY_STATUS,
  trends: TRENDS,
  bottlenecks: BOTTLENECKS,
  'at-risk': AT_RISK,
  stalled: { items: [] },
}

function mockDashboard() {
  return mockApi((request) => {
    const match = /^\/api\/v1\/dashboard\/([a-z-]+)/.exec(request.path)
    if (match?.[1] && match[1] in RESOURCES) return jsonResponse(RESOURCES[match[1]])
    if (request.path.startsWith('/api/v1/areas')) {
      return jsonResponse({ ...EMPTY_PAGE, items: [{ ...SUPPORT, is_active: true }] })
    }
    return jsonResponse(EMPTY_PAGE)
  })
}

function renderDashboard(user: User = makeUser()) {
  useSessionStore.getState().setSession(makeTokens(user), false)
  const router = createMemoryRouter(
    [
      { path: '/', Component: DashboardPage },
      { path: '/requests', Component: RequestsPage },
    ],
    { initialEntries: ['/'] },
  )
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('panel de control', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ width: 640, height: 240 }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('muestra los totales del resumen', async () => {
    mockDashboard()
    renderDashboard()

    expect(await screen.findByTestId('summary-open')).toHaveTextContent('36')
    expect(screen.getByTestId('summary-due_soon')).toHaveTextContent('4')
    expect(screen.getByTestId('summary-overdue')).toHaveTextContent('5')
    expect(screen.getByTestId('summary-stalled')).toHaveTextContent('7')
    expect(screen.getByTestId('summary-completed')).toHaveTextContent('17')
    expect(screen.getByTestId('summary-resolution')).toHaveTextContent('2,6 d')
  })

  it('cada tarjeta abre la lista con su filtro', async () => {
    const requests = mockDashboard()
    const user = userEvent.setup()
    const router = renderDashboard()

    await user.click(await screen.findByRole('link', { name: 'Ver solicitudes: Vencidas' }))

    expect(router.state.location.pathname).toBe('/requests')
    expect(router.state.location.search).toBe('?overdue=true')
    expect(await screen.findByLabelText('Solo vencidas')).toBeChecked()
    const list = requests.filter((request) => request.path.startsWith('/api/v1/requests?')).at(-1)
    expect(list?.path).toContain('overdue=true')
  })

  it.each([
    ['Abiertas', '?status=received&status=assigned&status=in_progress'],
    ['Próximas a vencer', '?sla_status=at_risk'],
    ['Sin movimiento', '?stalled=true'],
    ['Completadas · 7 días', '?status=completed&completed_from=2026-10-09'],
    [
      'Resolución promedio',
      '?status=completed&completed_from=2026-09-16&completed_to=2026-10-15',
    ],
  ])('la tarjeta «%s» enlaza a %s', async (label, search) => {
    mockDashboard()
    renderDashboard()

    const link = await screen.findByRole('link', { name: `Ver solicitudes: ${label}` })

    expect(link).toHaveAttribute('href', `/requests${search}`)
  })

  it('pinta las barras por estado con los colores del tema activo', async () => {
    document.documentElement.style.setProperty('--success', 'rgb(1, 150, 80)')
    document.documentElement.style.setProperty('--warning', 'rgb(220, 160, 0)')
    document.documentElement.style.setProperty('--muted-foreground', 'rgb(110, 110, 120)')
    mockDashboard()
    renderDashboard()

    await screen.findByTestId('summary-open')
    const chart = screen.getByRole('region', { name: 'Solicitudes por estado' })
    await vi.waitFor(() => {
      expect(chart.querySelector('[data-status="completed"]')).not.toBeNull()
    })
    expect(chart.querySelector('[data-status="completed"]')).toHaveAttribute(
      'fill',
      'rgb(1, 150, 80)',
    )
    expect(chart.querySelector('[data-status="in_progress"]')).toHaveAttribute(
      'fill',
      'rgb(220, 160, 0)',
    )
    expect(chart.querySelector('[data-status="received"]')).toHaveAttribute(
      'fill',
      'rgb(110, 110, 120)',
    )
  })

  it('resalta los cuellos de botella y enlaza a la lista por área y etapa', async () => {
    mockDashboard()
    renderDashboard()

    const heatmap = await screen.findByRole('region', { name: 'Cuellos de botella' })
    const cell = await within(heatmap).findByRole('link', {
      name: 'Ver solicitudes de Soporte TI en «Recibida»',
    })

    expect(cell).toHaveAttribute('data-bottleneck', 'true')
    expect(cell).toHaveAttribute('href', '/requests?status=received&area_id=area-1')
    expect(cell).toHaveAccessibleDescription(/Cuello de botella crítico/)
    expect(
      within(heatmap).getByRole('link', { name: 'Ver solicitudes de Soporte TI en «Asignada»' }),
    ).toHaveAttribute('data-bottleneck', 'false')
  })

  it('lista las solicitudes en riesgo con enlace al detalle y estados vacíos por bloque', async () => {
    mockDashboard()
    renderDashboard()

    const atRisk = await screen.findByRole('region', { name: 'En riesgo' })
    const link = await within(atRisk).findByRole('link', { name: /SOL-0092/ })

    expect(link).toHaveAttribute('href', '/requests/req-9')
    expect(within(atRisk).getByText('156 % del SLA')).toBeInTheDocument()
    expect(
      await screen.findByText('Todas las solicitudes abiertas tienen actividad reciente.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Disponible próximamente')).toBeInTheDocument()
  })

  it('muestra el error de un bloque sin romper el resto', async () => {
    mockApi((request) => {
      if (request.path.startsWith('/api/v1/dashboard/trends')) {
        return jsonResponse({ error: { code: 'common.internal_error', params: {} } }, 500)
      }
      const match = /^\/api\/v1\/dashboard\/([a-z-]+)/.exec(request.path)
      if (match?.[1] && match[1] in RESOURCES) return jsonResponse(RESOURCES[match[1]])
      return jsonResponse(EMPTY_PAGE)
    })
    renderDashboard()

    const trends = await screen.findByRole('region', { name: 'Creadas y completadas' })

    expect(await within(trends).findByRole('alert')).toHaveTextContent(
      'No se pudo cargar este bloque.',
    )
    expect(await screen.findByTestId('summary-open')).toHaveTextContent('36')
  })

  it('el solicitante no ve la matriz de cuellos de botella ni el filtro de área', async () => {
    mockDashboard()
    renderDashboard(makeUser({ role: 'requester' }))

    await screen.findByTestId('summary-open')

    expect(screen.queryByRole('region', { name: 'Cuellos de botella' })).toBeNull()
    expect(screen.queryByLabelText('Área')).toBeNull()
  })

  it('el filtro de área del admin se envía a todos los bloques', async () => {
    const requests = mockDashboard()
    const user = userEvent.setup()
    renderDashboard()

    const select = await screen.findByLabelText('Área')
    await within(select).findByRole('option', { name: 'Soporte TI' })
    await user.selectOptions(select, 'area-1')

    await vi.waitFor(() => {
      const summary = requests.filter((request) => request.path.includes('/dashboard/summary'))
      expect(summary.at(-1)?.path).toContain('area_id=area-1')
    })
    const atRisk = requests.filter((request) => request.path.includes('/dashboard/at-risk'))
    expect(atRisk.at(-1)?.path).toContain('area_id=area-1')
  })
})
