import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { RequestAnalysis, RequestDetail, RequestSummary, User } from '@/lib/api/types'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { useSessionStore } from '@/stores/session'
import { expectNoA11yViolations } from './a11y'
import {
  EMPTY_PAGE,
  jsonResponse,
  makeRequest,
  makeSummary,
  makeTokens,
  makeUser,
  mockApi,
  type RecordedRequest,
} from './fixtures'

vi.mock('@/lib/secureStore', () => ({
  saveRefreshToken: vi.fn(() => Promise.resolve()),
  loadRefreshToken: vi.fn(() => Promise.resolve(null)),
  clearRefreshToken: vi.fn(() => Promise.resolve()),
}))

const SUPPORT = { id: 'area-1', name: 'Soporte TI' }
const LAURA = { id: 'user-9', full_name: 'Laura Méndez' }

const RISKY: RequestSummary[] = [
  makeRequest({
    id: 'req-81',
    code: 'SOL-2481',
    title: 'Reembolso de matrícula por doble cobro',
    status: 'assigned',
    assignee: LAURA,
    sla_status: 'overdue',
    due_at: '2026-10-01T10:00:00Z',
    risk_score: 91,
  }),
  makeRequest({ id: 'req-77', code: 'SOL-2477', title: 'Acceso VPN', risk_score: 78, sla_status: 'at_risk', due_at: '2099-01-01T00:00:00Z' }),
  makeRequest({ id: 'req-63', code: 'SOL-2463', title: 'Aire acondicionado', risk_score: 64 }),
  makeRequest({ id: 'req-10', code: 'SOL-2410', title: 'Sin riesgo', risk_score: 12 }),
]

function insight(id: string): RequestAnalysis {
  return {
    request_id: id,
    notice: null,
    insight: null,
    risk: {
      score: 91,
      factors: [
        { factor: 'stage_delay', value: 144, reference: 24, reference_kind: 'p90_area_stage_priority', normalized: 1, weight: 0.25, points: 25 },
        { factor: 'sla_consumed', value: 1.4, reference: null, reference_kind: null, normalized: 0.93, weight: 0.3, points: 28 },
        { factor: 'inactivity', value: 140, reference: 12, reference_kind: null, normalized: 1, weight: 0.2, points: 20 },
        { factor: 'priority', value: 'high', reference: null, reference_kind: null, normalized: 0.7, weight: 0.15, points: 10.5 },
        { factor: 'assignee_load', value: 14, reference: null, reference_kind: null, normalized: 1, weight: 0.1, points: 10 },
      ],
    },
  }
}

function detail(id: string): RequestDetail {
  const summary = RISKY.find((item) => item.id === id) ?? makeRequest({ id })
  return {
    ...summary,
    version: 7,
    description: 'Detalle',
    created_at: summary.received_at,
    updated_at: summary.received_at,
    allowed_transitions: [],
    permissions: { editable_fields: [], can_assign: true, can_comment: true },
  }
}

interface MockOptions {
  summaryStatus?: number
  suggestion?: boolean
}

function mockPanel({ summaryStatus = 200, suggestion = true }: MockOptions = {}): RecordedRequest[] {
  return mockApi((request) => {
    const path = request.path
    if (path.startsWith('/api/v1/dashboard/summary')) {
      return summaryStatus === 200
        ? jsonResponse(makeSummary())
        : jsonResponse({ error: { code: 'common.internal_error', params: {} } }, summaryStatus)
    }
    if (path.startsWith('/api/v1/ai/overview')) return jsonResponse({ area_id: null, insight: null, notice: null })
    const insightMatch = /^\/api\/v1\/ai\/requests\/([^/]+)\/insight/.exec(path)
    if (insightMatch?.[1]) return jsonResponse(insight(insightMatch[1]))
    const suggestionMatch = /^\/api\/v1\/requests\/([^/]+)\/assignment-suggestion/.exec(path)
    if (suggestionMatch) {
      return jsonResponse({
        suggestion: suggestion
          ? { assignee: { id: 'user-5', full_name: 'Pablo Ortiz' }, open_count: 5, current_open_count: 14 }
          : null,
      })
    }
    const assignMatch = /^\/api\/v1\/requests\/([^/]+)\/assign$/.exec(path)
    if (assignMatch?.[1] && request.method === 'POST') return jsonResponse(detail(assignMatch[1]))
    const detailMatch = /^\/api\/v1\/requests\/(req-[^/?]+)$/.exec(path)
    if (detailMatch?.[1]) return jsonResponse(detail(detailMatch[1]))
    if (path.startsWith('/api/v1/requests?')) {
      return jsonResponse({ ...EMPTY_PAGE, items: path.includes('risk_score') ? RISKY : RISKY.slice(0, 2), total: 4 })
    }
    if (path.startsWith('/api/v1/areas')) return jsonResponse({ ...EMPTY_PAGE, items: [{ ...SUPPORT, is_active: true }] })
    return jsonResponse(EMPTY_PAGE)
  })
}

function renderPanel(user: User = makeUser({ full_name: 'Sofía Escobar', role: 'supervisor', area: SUPPORT })) {
  useSessionStore.getState().setSession(makeTokens(user), false)
  const router = createMemoryRouter(
    [
      { path: '/', Component: DashboardPage },
      { path: '/requests', element: <p>lista</p> },
      { path: '/requests/:id', element: <p>detalle</p> },
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

describe('panel', () => {
  it('saluda por el nombre y cuenta las solicitudes que necesitan atención', async () => {
    mockPanel()
    renderPanel()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hola, Sofía')
    expect(await screen.findByText('3 necesitan tu atención hoy')).toBeInTheDocument()
  })

  it('muestra las cifras de hoy con sus etiquetas y enlaces a la lista filtrada', async () => {
    mockPanel()
    renderPanel()

    const open = await screen.findByTestId('kpi-open')
    expect(open).toHaveTextContent('Abiertas')
    expect(open).toHaveTextContent('128')
    expect(open).toHaveTextContent('en 5 áreas')
    expect(open).toHaveAttribute('href', '/requests')
    expect(screen.getByTestId('kpi-overdue')).toHaveTextContent('+3 desde ayer')
    expect(screen.getByTestId('kpi-overdue')).toHaveAttribute('href', '/requests?overdue=true')
    expect(screen.getByTestId('kpi-dueSoon')).toHaveTextContent('6 con riesgo alto')
    expect(screen.getByTestId('kpi-dueSoon')).toHaveAttribute('href', '/requests?sla_status=at_risk')
    expect(screen.getByTestId('kpi-stalled')).toHaveTextContent('2 posiblemente olvidadas')
    expect(screen.getByRole('link', { name: 'Vencidas: 9, +3 desde ayer. Ver solicitudes' })).toBeInTheDocument()
    const stages = screen.getByRole('list', { name: 'Abiertas por etapa' })
    expect(within(stages).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Recibida · 34',
      'Asignada · 41',
      'En proceso · 53',
    ])
  })

  it('lista las solicitudes con más riesgo y muestra el detalle de la seleccionada', async () => {
    mockPanel()
    const user = userEvent.setup()
    renderPanel()

    const list = await screen.findByRole('tablist', { name: 'Solicitudes con más riesgo' })
    const tabs = within(list).getAllByRole('tab')
    expect(tabs).toHaveLength(3)
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[0]).toHaveTextContent('SOL-2481')
    expect(tabs[0]).toHaveTextContent('Alto')
    expect(tabs[0]).toHaveTextContent('91')
    const panel = screen.getByRole('tabpanel')
    expect(within(panel).getByText('Reembolso de matrícula por doble cobro')).toBeInTheDocument()
    expect(await within(panel).findByText('6 días')).toBeInTheDocument()
    expect(within(panel).getByText('en Asignada')).toBeInTheDocument()
    expect(within(panel).getByText('referencia: P90 del área')).toBeInTheDocument()
    expect(within(panel).getByText('14')).toBeInTheDocument()
    expect(await within(panel).findByText('Reasignar a Pablo Ortiz, con 5 abiertas.')).toBeInTheDocument()

    tabs[0]?.focus()
    await user.keyboard('{ArrowDown}')
    expect(within(list).getAllByRole('tab')[1]).toHaveFocus()
    expect(within(list).getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true')
    expect(within(screen.getByRole('tabpanel')).getByText('Acceso VPN')).toBeInTheDocument()
  })

  it('reasigna con la sugerencia después de confirmar', async () => {
    const requests = mockPanel()
    const user = userEvent.setup()
    renderPanel()

    const panel = await screen.findByRole('tabpanel')
    await user.click(await within(panel).findByRole('button', { name: 'Reasignar ahora' }))
    const dialog = screen.getByRole('dialog', { name: 'Reasignar SOL-2481' })
    expect(dialog).toHaveAccessibleDescription('SOL-2481 pasará a Pablo Ortiz, que tiene 5 solicitudes abiertas.')
    await user.click(within(dialog).getByRole('button', { name: 'Reasignar' }))

    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    const assign = requests.find((request) => request.path === '/api/v1/requests/req-81/assign')
    expect(assign?.body).toEqual({ assignee_id: 'user-5', version: 7 })
  })

  it('sin sugerencia solo ofrece abrir la solicitud', async () => {
    mockPanel({ suggestion: false })
    renderPanel()

    const panel = await screen.findByRole('tabpanel')
    expect(await within(panel).findByText('Sin sugerencia de reasignación.')).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'Abrir' })).toHaveAttribute('href', '/requests/req-81')
    expect(within(panel).queryByRole('button', { name: 'Reasignar ahora' })).toBeNull()
  })

  it('un error del resumen no rompe el resto del panel', async () => {
    mockPanel({ summaryStatus: 500 })
    renderPanel()

    const status = await screen.findByRole('region', { name: 'Estado actual' })
    expect(await within(status).findByRole('alert')).toHaveTextContent('No se pudo cargar esta información.')
    expect(within(status).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    expect(await screen.findByRole('tablist')).toBeInTheDocument()
  })

  it('el admin filtra por área todo el panel', async () => {
    const requests = mockPanel()
    const user = userEvent.setup()
    renderPanel(makeUser({ full_name: 'Ana Admin' }))

    const select = await screen.findByRole('combobox', { name: 'Área' })
    await within(select).findByRole('option', { name: 'Soporte TI' })
    await user.selectOptions(select, 'area-1')

    await vi.waitFor(() => {
      expect(requests.some((request) => request.path === '/api/v1/dashboard/summary?area_id=area-1')).toBe(true)
    })
    expect(requests.some((request) => request.path.startsWith('/api/v1/requests?') && request.path.includes('area_id=area-1'))).toBe(true)
  })

  it.each(['assignee', 'requester'] as const)('el rol %s ve sus solicitudes sin IA ni cifras globales', async (role) => {
    mockPanel()
    renderPanel(makeUser({ full_name: 'Carlos Solicitante', role, area: role === 'assignee' ? SUPPORT : null }))

    expect(await screen.findByRole('region', { name: 'Mis solicitudes' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Recomendaciones de IA' })).toBeNull()
    expect(await screen.findByTestId('kpi-open')).toHaveTextContent('en tu alcance')
    expect(screen.queryByRole('combobox', { name: 'Área' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Estado de mis solicitudes' })).toBeInTheDocument()
  })

  it('no tiene infracciones de axe', async () => {
    mockPanel()
    renderPanel()

    await screen.findByText('Reasignar a Pablo Ortiz, con 5 abiertas.')
    await expectNoA11yViolations()
  })
})
