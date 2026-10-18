import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BottleneckCell, StageFlow, TrendSeries, User } from '@/lib/api/types'
import { toCsv } from '@/lib/csv'
import { exportTextFile } from '@/lib/exportFile'
import { AnalyticsPage } from '@/pages/analytics/AnalyticsPage'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { useSessionStore } from '@/stores/session'
import { expectNoA11yViolations } from './a11y'
import {
  EMPTY_PAGE,
  jsonResponse,
  makeSummary,
  makeTokens,
  makeUser,
  mockApi,
  type RecordedRequest,
  SUMMARY_RANGE,
} from './fixtures'

vi.mock('@/lib/secureStore', () => ({
  saveRefreshToken: vi.fn(() => Promise.resolve()),
  loadRefreshToken: vi.fn(() => Promise.resolve(null)),
  clearRefreshToken: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/exportFile', () => ({
  exportTextFile: vi.fn(() => Promise.resolve('/Users/demo/Downloads/solvia-entrada-vs-cierre.csv')),
}))

vi.mock('@/pages/analytics/TrendPlot', () => ({
  TrendPlot: ({ days }: { days: readonly unknown[] }) => <div data-testid="trend-plot" data-days={days.length} />,
}))

const SUPPORT = { id: 'area-1', name: 'Soporte TI' }
const FINANCE = { id: 'area-2', name: 'Finanzas' }

const TRENDS: TrendSeries = {
  days: [
    { day: '2026-10-13', created: 4, completed: 1 },
    { day: '2026-10-14', created: 2, completed: 3 },
    { day: '2026-10-15', created: 5, completed: 2 },
  ],
  range: SUMMARY_RANGE,
}

const FLOW: StageFlow = {
  stages: [
    { status: 'received', count: 34, median_hours: 12, target_hours: 24 },
    { status: 'assigned', count: 41, median_hours: 43.2, target_hours: 24 },
    { status: 'in_progress', count: 0, median_hours: null, target_hours: null },
  ],
}

function cell(overrides: Partial<BottleneckCell>): BottleneckCell {
  return {
    area: FINANCE,
    status: 'received',
    count: 3,
    avg_hours: 10,
    median_count: 3,
    median_avg_hours: 10,
    sla_max_hours: 24,
    is_bottleneck: false,
    reasons: [],
    ...overrides,
  }
}

const CELLS: BottleneckCell[] = [
  cell({ status: 'received', avg_hours: 12, median_avg_hours: 10 }),
  cell({ status: 'assigned', avg_hours: 26, median_avg_hours: 10, is_bottleneck: true, reasons: ['avg_above_sla'] }),
  cell({ status: 'in_progress', avg_hours: 14, median_avg_hours: 10 }),
  cell({ area: SUPPORT, status: 'received', avg_hours: 9, median_avg_hours: 10, is_bottleneck: true, reasons: ['count_above_median'] }),
  cell({ area: SUPPORT, status: 'assigned', count: 0, avg_hours: null, median_avg_hours: 8 }),
  cell({ area: SUPPORT, status: 'in_progress', avg_hours: 13, median_avg_hours: 10 }),
]

function mockAnalytics(): RecordedRequest[] {
  return mockApi((request) => {
    const path = request.path
    if (path.startsWith('/api/v1/dashboard/trends')) return jsonResponse(TRENDS)
    if (path.startsWith('/api/v1/dashboard/summary')) return jsonResponse(makeSummary({ avg_resolution_hours: 61.4 }))
    if (path.startsWith('/api/v1/dashboard/stage-flow')) return jsonResponse(FLOW)
    if (path.startsWith('/api/v1/dashboard/bottlenecks')) return jsonResponse({ cells: CELLS })
    if (path.startsWith('/api/v1/ai/overview')) return jsonResponse({ area_id: null, insight: null, notice: null })
    if (path.startsWith('/api/v1/areas')) {
      return jsonResponse({ ...EMPTY_PAGE, items: [{ ...SUPPORT, is_active: true }, { ...FINANCE, is_active: true }] })
    }
    return jsonResponse(EMPTY_PAGE)
  })
}

function renderAnalytics(user: User = makeUser({ full_name: 'Sofía Escobar', role: 'supervisor', area: SUPPORT }), entry = '/analytics') {
  useSessionStore.getState().setSession(makeTokens(user), false)
  const router = createMemoryRouter(
    [
      { path: '/', Component: DashboardPage },
      { path: '/analytics', Component: AnalyticsPage },
      { path: '/requests', element: <p>lista</p> },
    ],
    { initialEntries: [entry] },
  )
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

describe('Análisis', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 9, 18, 10, 0), toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.mocked(exportTextFile).mockClear()
  })

  it('muestra entrada vs. cierre con sus totales y una tabla accesible', async () => {
    mockAnalytics()
    renderAnalytics()

    const trends = await screen.findByRole('region', { name: 'Entrada vs. cierre' })
    expect(await within(trends).findByTestId('trend-plot')).toHaveAttribute('data-days', '3')
    expect(within(trends).getByRole('list', { name: 'Series del gráfico' })).toHaveTextContent('CreadasCompletadas')
    expect(await within(trends).findByText('3 días')).toBeInTheDocument()
    expect(within(trends).getByText('6')).toBeInTheDocument()
    const table = within(trends).getByRole('table', { name: 'Solicitudes creadas y completadas por día' })
    expect(within(table).getAllByRole('row')).toHaveLength(4)
    expect(within(table).getByRole('rowheader', { name: '15 oct' })).toBeInTheDocument()
  })

  it('el flujo por etapa marca solo las etapas que superan su objetivo', async () => {
    mockAnalytics()
    renderAnalytics()

    const flow = await screen.findByRole('region', { name: 'Flujo por etapa' })
    const rows = await within(flow).findAllByRole('listitem')
    expect(rows).toHaveLength(3)
    const [received, assigned, inProgress] = rows as [HTMLElement, HTMLElement, HTMLElement]
    expect(received).toHaveTextContent('Mediana 12 h · objetivo 1 día')
    expect(received).toHaveTextContent('34 abiertas')
    expect(received).not.toHaveTextContent('Acumula')
    expect(assigned).toHaveTextContent('Mediana 2 días · objetivo 1 día')
    expect(assigned).toHaveTextContent('Acumula 1,8× su objetivo')
    expect(inProgress).toHaveTextContent('Sin abiertas')
    expect(inProgress).toHaveTextContent('0 abiertas')
  })

  it('los cuellos de botella usan rojo solo si el backend los marca y ámbar desde 1,3×', async () => {
    mockAnalytics()
    renderAnalytics()

    const matrix = await screen.findByRole('region', { name: 'Cuellos de botella' })
    const finance = await within(matrix).findByRole('row', { name: /Finanzas/ })
    const support = within(matrix).getByRole('row', { name: /Soporte TI/ })
    const levels = (row: HTMLElement) => within(row).getAllByRole('link').map((link) => link.dataset.level)

    expect(levels(finance)).toEqual(['normal', 'bottleneck', 'slow'])
    expect(levels(support)).toEqual(['bottleneck', 'normal', 'slow'])
    expect(within(finance).getByRole('link', { name: 'Finanzas, Asignada: 2,6×, Cuello de botella. Ver solicitudes' })).toHaveAttribute(
      'href',
      '/requests?status=assigned&area_id=area-2',
    )
    expect(within(support).getByRole('link', { name: /Soporte TI, Recibida: 0,9×, Cuello de botella/ })).toBeInTheDocument()
    expect(within(support).getByRole('link', { name: /Asignada: sin datos, Normal/ })).toBeInTheDocument()
    expect(within(support).getByRole('link', { name: /En proceso: 1,3×, Lento/ })).toBeInTheDocument()
    expect(within(matrix).getByRole('list', { name: 'Leyenda de colores' })).toHaveTextContent(
      'Normal (menos de 1,3×)Lento (1,3× o más)Cuello de botella (acumulación inusual o promedio sobre el SLA)',
    )
    expect(within(matrix).getByText('El promedio supera el máximo SLA')).toBeInTheDocument()
  })

  it('el periodo cambia el rango de las tendencias y queda en la URL', async () => {
    const requests = mockAnalytics()
    const user = userEvent.setup()
    const router = renderAnalytics()

    await screen.findByTestId('trend-plot')
    expect(requests.some((request) => request.path === '/api/v1/dashboard/trends')).toBe(true)

    await user.click(screen.getByRole('radio', { name: '7 días' }))
    await vi.waitFor(() => {
      expect(requests.some((request) => request.path === '/api/v1/dashboard/trends?date_from=2026-10-12')).toBe(true)
    })
    expect(requests.some((request) => request.path === '/api/v1/dashboard/summary?date_from=2026-10-12')).toBe(true)
    expect(router.state.location.search).toBe('?range=7')

    await user.click(screen.getByRole('radio', { name: 'Trimestre' }))
    await vi.waitFor(() => {
      expect(requests.some((request) => request.path === '/api/v1/dashboard/trends?date_from=2026-07-21')).toBe(true)
    })
    expect(requests.filter((request) => request.path.startsWith('/api/v1/dashboard/stage-flow'))).toHaveLength(1)
  })

  it('descarga el CSV con los datos cargados y avisa dónde quedó', async () => {
    mockAnalytics()
    const user = userEvent.setup()
    renderAnalytics()

    const trends = await screen.findByRole('region', { name: 'Entrada vs. cierre' })
    await within(trends).findByTestId('trend-plot')
    await user.click(within(trends).getByRole('button', { name: 'Descargar CSV' }))

    expect(exportTextFile).toHaveBeenCalledWith(
      'solvia-entrada-vs-cierre-2026-09-16-2026-10-15.csv',
      '﻿Fecha,Creadas,Completadas\r\n2026-10-13,4,1\r\n2026-10-14,2,3\r\n2026-10-15,5,2\r\n',
      'text/csv;charset=utf-8',
    )
    expect(await within(trends).findByRole('status')).toHaveTextContent(
      'CSV guardado en /Users/demo/Downloads/solvia-entrada-vs-cierre.csv',
    )
  })

  it('el solicitante ve sus tendencias y flujo, sin cuellos de botella', async () => {
    const requests = mockAnalytics()
    renderAnalytics(makeUser({ full_name: 'Carlos Solicitante', role: 'requester', area: null }))

    expect(await screen.findByRole('region', { name: 'Flujo por etapa' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Cuellos de botella' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Área' })).toBeNull()
    expect(requests.some((request) => request.path.startsWith('/api/v1/dashboard/bottlenecks'))).toBe(false)
  })

  it('el filtro de área del admin se comparte con el panel', async () => {
    const requests = mockAnalytics()
    const user = userEvent.setup()
    const router = renderAnalytics(makeUser({ full_name: 'Ana Admin', role: 'admin' }))

    const select = await screen.findByRole('combobox', { name: 'Área' })
    await within(select).findByRole('option', { name: 'Finanzas' })
    await user.selectOptions(select, 'area-2')
    await vi.waitFor(() => {
      expect(requests.some((request) => request.path === '/api/v1/dashboard/stage-flow?area_id=area-2')).toBe(true)
    })

    await router.navigate('/')
    expect(await screen.findByRole('combobox', { name: 'Área' })).toHaveValue('area-2')
    await vi.waitFor(() => {
      expect(requests.some((request) => request.path === '/api/v1/dashboard/summary?area_id=area-2')).toBe(true)
    })
  })

  it('no tiene problemas de accesibilidad', async () => {
    mockAnalytics()
    renderAnalytics()

    await screen.findByTestId('trend-plot')
    await screen.findByRole('row', { name: /Finanzas/ })
    await expectNoA11yViolations(document.body)
  })
})

describe('toCsv', () => {
  it('escapa comillas, separadores y fórmulas', () => {
    expect(toCsv([['Área, sede', 'Dijo "hola"', '=SUMA(A1)', 7]])).toBe('﻿"Área, sede","Dijo ""hola""",\'=SUMA(A1),7\r\n')
  })
})
