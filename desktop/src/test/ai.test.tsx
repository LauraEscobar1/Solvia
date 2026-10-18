import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type {
  AIStatus,
  OverviewAnalysis,
  RequestAnalysis,
  RequestDetail,
  RiskRead,
  User,
} from '@/lib/api/types'
import { AIStatusPage } from '@/pages/admin/AIStatusPage'
import { AIBanner } from '@/pages/dashboard/AIBanner'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { RiskCard } from '@/pages/requests/detail/RiskCard'
import { RequestTable } from '@/pages/requests/RequestTable'
import { useSessionStore } from '@/stores/session'
import {
  EMPTY_PAGE,
  errorResponse,
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

const META = {
  trigger: 'scheduled' as const,
  language: 'es' as const,
  provider: 'deepseek',
  tokens_used: 3000,
  cached: false,
  created_at: '2026-10-16T11:00:00Z',
  feedback: {},
}

const text = (value: string) => ({ text: value, code: null, params: {} })
const coded = (code: string, params: Record<string, unknown> = {}) => ({ text: null, code, params })

const AI_OVERVIEW: OverviewAnalysis = {
  area_id: null,
  notice: null,
  insight: {
    ...META,
    id: 'insight-1',
    source: 'ai',
    model: 'deepseek-v4-pro',
    fallback_reason: null,
    area_id: null,
    content: {
      summary: text('Soporte TI acumula solicitudes recibidas. <b>sin HTML</b>'),
      findings: [
        {
          type: 'bottleneck',
          area_id: 'area-1',
          status: 'received',
          evidence: text('7 solicitudes frente a una mediana de 2.'),
        },
      ],
      recommendations: [
        {
          title: text('Revisar SOL-0106'),
          detail: text('Asignarla hoy.'),
          priority: 'high',
          target: { request_id: 'req-106', request_code: 'SOL-0106', area_id: null, status: null },
        },
        {
          title: text('Aliviar recibidas'),
          detail: text('Reparte la carga.'),
          priority: 'medium',
          target: { request_id: null, request_code: null, area_id: 'area-1', status: 'received' },
        },
      ],
    },
  },
}

const RULE_OVERVIEW: OverviewAnalysis = {
  area_id: null,
  notice: 'ai.budget_exceeded',
  insight: {
    ...META,
    id: 'insight-2',
    source: 'rule',
    model: null,
    tokens_used: 0,
    fallback_reason: 'ai.budget_exceeded',
    area_id: null,
    content: {
      summary: coded('ai.rules.overview.summary', {
        open: 36,
        overdue: 5,
        due_soon: 4,
        stalled: 7,
        bottlenecks: 2,
      }),
      findings: [{ type: 'sla', area_id: null, status: null, evidence: coded('ai.rules.finding.overdue', { count: 5 }) }],
      recommendations: [
        {
          title: coded('ai.rules.recommendation.bottleneck.title', {
            area: 'Soporte TI',
            status: 'received',
          }),
          detail: coded('ai.rules.recommendation.bottleneck.detail', {
            area: 'Soporte TI',
            status: 'received',
            count: 7,
          }),
          priority: 'high',
          target: { request_id: null, request_code: null, area_id: 'area-1', status: 'received' },
        },
      ],
    },
  },
}

const RISK: RiskRead = {
  score: 76,
  factors: [
    { factor: 'stage_delay', value: 139.6, reference: 20.7, reference_kind: 'p90_stage_priority', normalized: 1, weight: 0.25, points: 25 },
    { factor: 'sla_consumed', value: 1.34, reference: null, reference_kind: null, normalized: 0.893, weight: 0.3, points: 26.8 },
    { factor: 'inactivity', value: 1.6, reference: 4, reference_kind: null, normalized: 0.2, weight: 0.2, points: 4.1 },
    { factor: 'priority', value: 'high', reference: null, reference_kind: null, normalized: 0.7, weight: 0.15, points: 10.5 },
    { factor: 'assignee_load', value: 'unassigned', reference: 20.7, reference_kind: 'p90_stage_priority', normalized: 1, weight: 0.1, points: 10 },
  ],
}

function analysis(overrides: Partial<RequestAnalysis> = {}): RequestAnalysis {
  return {
    request_id: 'req-106',
    risk: RISK,
    notice: null,
    insight: {
      ...META,
      id: 'insight-3',
      trigger: 'manual',
      source: 'ai',
      model: 'deepseek-flash',
      tokens_used: 820,
      fallback_reason: null,
      content: {
        risk_score: 84,
        summary: text('<img src=x onerror=alert(1)> Sin responsable y vencida.'),
        causes: [text('Lleva 140 h en recibidas')],
        actions: [{ title: text('Asignar hoy'), detail: text('Asigna SOL-0106 a alguien del área.') }],
      },
    },
    ...overrides,
  }
}

function renderInRouter(element: ReactElement, user: User = makeUser()) {
  useSessionStore.getState().setSession(makeTokens(user), false)
  const router = createMemoryRouter([{ path: '/', element }], { initialEntries: ['/'] })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

const OVERVIEW_INSIGHT = AI_OVERVIEW.insight as NonNullable<typeof AI_OVERVIEW.insight>

function panelApi(overview: unknown) {
  return (request: RecordedRequest) => {
    const path = request.path
    if (path.startsWith('/api/v1/ai/overview')) return jsonResponse(overview)
    if (path.startsWith('/api/v1/dashboard/summary')) return jsonResponse(makeSummary())
    if (path.endsWith('/assignment-suggestion')) {
      return jsonResponse({ suggestion: { assignee: { id: 'user-5', full_name: 'Pablo Ortiz' }, open_count: 5, current_open_count: 14 } })
    }
    if (path === '/api/v1/requests/req-106') {
      return jsonResponse({ ...makeRequest({ id: 'req-106', code: 'SOL-0106' }), description: 'x', created_at: '2026-10-10T10:00:00Z', updated_at: '2026-10-10T10:00:00Z', allowed_transitions: [], permissions: { editable_fields: [], can_assign: true, can_comment: true } })
    }
    return errorResponse('common.not_found', 404)
  }
}

describe('banner de IA en el panel', () => {
  it('rota los hallazgos y abre las recomendaciones con enlaces y la etiqueta de verificación', async () => {
    mockApi(panelApi(AI_OVERVIEW))
    const user = userEvent.setup()
    renderInRouter(<AIBanner />)

    const banner = await screen.findByRole('region', { name: 'Recomendaciones de IA' })
    expect(await within(banner).findByTestId('ai-banner-text')).toHaveTextContent(
      'Soporte TI acumula solicitudes recibidas. <b>sin HTML</b>',
    )
    expect(banner.querySelector('b')).toBeNull()
    await user.click(within(banner).getByRole('button', { name: 'Hallazgo 2 de 2' }))
    expect(within(banner).getByTestId('ai-banner-text')).toHaveTextContent('7 solicitudes frente a una mediana de 2.')
    expect(within(banner).getByRole('button', { name: 'Reanudar la rotación' })).toBeInTheDocument()

    await user.click(within(banner).getByRole('button', { name: 'Ver 2 recomendaciones' }))
    const sheet = screen.getByRole('dialog', { name: 'Análisis IA' })
    expect(within(sheet).getByTestId('overview-summary')).toHaveTextContent('Soporte TI acumula solicitudes recibidas.')
    expect(within(sheet).getByRole('link', { name: 'Ver SOL-0106' })).toHaveAttribute('href', '/requests/req-106')
    expect(within(sheet).getByRole('link', { name: 'Ver' })).toHaveAttribute(
      'href',
      '/requests?status=received&area_id=area-1',
    )
    expect(within(sheet).getByRole('region', { name: 'Vencimientos previstos · próximos 5 días' })).toBeInTheDocument()
    expect(within(sheet).getByLabelText('Hoy: 3 por vencer')).toBeInTheDocument()
    expect(within(sheet).getByLabelText('vie: 5 por vencer')).toBeInTheDocument()
    expect(within(sheet).getByText('15 en total')).toBeInTheDocument()
    expect(within(sheet).getByText(/Basado en tiempos de 1\.?240 solicitudes previas/)).toBeInTheDocument()
    expect(await within(sheet).findByRole('button', { name: 'Reasignar' })).toBeInTheDocument()
    expect(within(sheet).getByText('Generado por IA: verifica antes de actuar')).toBeInTheDocument()
  })

  it('el titular grande usa headline y, sin él, la primera frase recortada del resumen', async () => {
    const withHeadline = {
      ...AI_OVERVIEW,
      insight: { ...OVERVIEW_INSIGHT, content: { ...OVERVIEW_INSIGHT.content, headline: text('La etapa Asignada acumula retraso en Finanzas.') } },
    }
    mockApi(panelApi(withHeadline))
    const user = userEvent.setup()
    renderInRouter(<AIBanner />)
    await user.click(await screen.findByRole('button', { name: 'Ver 2 recomendaciones' }))
    const sheet = screen.getByRole('dialog', { name: 'Análisis IA' })
    expect(within(sheet).getByTestId('overview-headline')).toHaveTextContent('La etapa Asignada acumula retraso en Finanzas.')
    expect(within(sheet).getByTestId('overview-summary')).toHaveTextContent('Soporte TI acumula solicitudes recibidas.')
    expect(within(sheet).getByText('Asignada')).toHaveClass('text-accent')
  })

  it('recorta el titular de respaldo a 15 palabras y ofrece «Ver más» en resúmenes largos', async () => {
    const long = 'Uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis diecisiete. '.repeat(3)
    mockApi(panelApi({ ...AI_OVERVIEW, insight: { ...OVERVIEW_INSIGHT, content: { ...OVERVIEW_INSIGHT.content, summary: text(long) } } }))
    const user = userEvent.setup()
    renderInRouter(<AIBanner />)
    await user.click(await screen.findByRole('button', { name: 'Ver 2 recomendaciones' }))
    const sheet = screen.getByRole('dialog', { name: 'Análisis IA' })
    expect(within(sheet).getByTestId('overview-headline')).toHaveTextContent('Uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince…')
    const more = within(sheet).getByRole('button', { name: 'Ver más' })
    await user.click(more)
    expect(more).toHaveAttribute('aria-expanded', 'true')
  })

  it('no muestra un análisis de otro idioma: lo genera en el idioma activo', async () => {
    const { default: i18n } = await import('@/i18n')
    await i18n.changeLanguage('en')
    const requests = mockApi((request) => {
      if (request.method === 'POST' && request.path.startsWith('/api/v1/ai/overview/analyze')) {
        return jsonResponse({ ...AI_OVERVIEW, insight: { ...OVERVIEW_INSIGHT, language: 'en' } })
      }
      if (request.path.startsWith('/api/v1/ai/overview')) return jsonResponse({ area_id: null, insight: null, notice: null })
      if (request.path.startsWith('/api/v1/dashboard/summary')) return jsonResponse(makeSummary())
      return errorResponse('common.not_found', 404)
    })
    const user = userEvent.setup()
    renderInRouter(<AIBanner />)
    await user.click(await screen.findByRole('button', { name: /View/ }))

    await screen.findByTestId('overview-headline')
    expect(requests.filter((request) => request.method === 'POST').map((request) => request.path)).toEqual([
      '/api/v1/ai/overview/analyze?language=en',
    ])
    expect(requests.some((request) => request.path === '/api/v1/ai/overview?language=en')).toBe(true)
  })

  it('sin datos de vencimientos muestra los 5 días hábiles con 0', async () => {
    mockApi((request) =>
      request.path.startsWith('/api/v1/dashboard/summary')
        ? jsonResponse(makeSummary({ due_by_day: [] }))
        : panelApi(AI_OVERVIEW)(request),
    )
    const user = userEvent.setup()
    renderInRouter(<AIBanner />)
    await user.click(await screen.findByRole('button', { name: 'Ver 2 recomendaciones' }))
    const forecast = within(screen.getByRole('dialog', { name: 'Análisis IA' })).getByRole('region', {
      name: 'Vencimientos previstos · próximos 5 días',
    })

    expect(await within(forecast).findByText('0 en total')).toBeInTheDocument()
    expect(within(forecast).getAllByLabelText(/: 0 por vencer$/)).toHaveLength(5)
    expect(within(forecast).getByLabelText('Hoy: 0 por vencer')).toBeInTheDocument()
  })

  it('en respaldo traduce el análisis por reglas y muestra el aviso', async () => {
    mockApi(panelApi(RULE_OVERVIEW))
    const user = userEvent.setup()
    renderInRouter(<AIBanner />)

    const banner = await screen.findByRole('region', { name: 'Recomendaciones de IA' })
    expect(await within(banner).findByTestId('ai-banner-text')).toHaveTextContent(
      'Hay 36 solicitudes abiertas: 5 vencidas, 4 por vencer y 7 sin movimiento.',
    )
    await user.click(within(banner).getByRole('button', { name: 'Ver 1 recomendación' }))
    const sheet = screen.getByRole('dialog', { name: 'Análisis IA' })
    expect(within(sheet).getByText('Aliviar Soporte TI · Recibida')).toBeInTheDocument()
    expect(within(sheet).getByRole('status')).toHaveTextContent('Se agotó el presupuesto diario de IA.')
    expect(within(sheet).queryByText('Generado por IA: verifica antes de actuar')).toBeNull()
  })

  it('regenera el análisis y marca recomendaciones como útiles', async () => {
    const requests = mockApi((request) => {
      if (request.method === 'POST' && request.path.startsWith('/api/v1/ai/overview/analyze')) {
        return jsonResponse(AI_OVERVIEW)
      }
      if (request.path.includes('/feedback')) return new Response(null, { status: 204 })
      if (request.path.startsWith('/api/v1/ai/overview')) return jsonResponse({ area_id: null, insight: null, notice: null })
      if (request.path.startsWith('/api/v1/dashboard/summary')) return jsonResponse(makeSummary())
      return errorResponse('common.not_found', 404)
    })
    const user = userEvent.setup()
    renderInRouter(<AIBanner />)

    const banner = await screen.findByRole('region', { name: 'Recomendaciones de IA' })
    expect(await within(banner).findByText('Todavía no hay un análisis.')).toBeInTheDocument()
    await user.click(within(banner).getByRole('button', { name: 'Ver recomendaciones' }))
    const sheet = screen.getByRole('dialog', { name: 'Análisis IA' })
    await user.click(within(sheet).getByRole('button', { name: 'Regenerar' }))
    await within(sheet).findByTestId('overview-summary')
    await user.click(within(sheet).getAllByRole('button', { name: 'Útil' })[0] as HTMLElement)

    expect(requests.some((request) => request.method === 'POST' && request.path === '/api/v1/ai/overview/analyze?language=es')).toBe(true)
    const feedback = requests.find((request) => request.path.includes('/feedback'))
    expect(feedback?.path).toBe('/api/v1/ai/insights/insight-1/feedback')
    expect(feedback?.body).toEqual({ item: 0, useful: true })
  })

  it.each([
    ['admin', true],
    ['supervisor', true],
    ['assignee', false],
    ['requester', false],
  ] as const)('el rol %s ve el banner de IA: %s', async (role, visible) => {
    mockApi((request) => {
      if (request.path.startsWith('/api/v1/ai/overview')) return jsonResponse(AI_OVERVIEW)
      if (request.path.startsWith('/api/v1/dashboard/summary')) return jsonResponse(makeSummary())
      return jsonResponse(EMPTY_PAGE)
    })
    renderInRouter(<DashboardPage />, makeUser({ role, area: { id: 'area-1', name: 'Soporte TI' } }))

    await screen.findByTestId('kpi-open')
    if (visible) {
      expect(await screen.findByRole('region', { name: 'Recomendaciones de IA' })).toBeInTheDocument()
    } else {
      expect(screen.queryByRole('region', { name: 'Recomendaciones de IA' })).toBeNull()
    }
  })
})

function riskDetail(): RequestDetail {
  return {
    ...makeRequest({ id: 'req-106', code: 'SOL-0106', status: 'received' }),
    description: 'Detalle',
    created_at: '2026-10-10T10:00:00Z',
    updated_at: '2026-10-10T10:00:00Z',
    allowed_transitions: [],
    permissions: { editable_fields: [], can_assign: true, can_comment: true },
  }
}

describe('tarjeta de riesgo', () => {
  it('muestra el puntaje, los factores y el análisis de la IA como texto plano', async () => {
    mockApi(() => jsonResponse(analysis()))
    const user = userEvent.setup()
    renderInRouter(<RiskCard detail={riskDetail()} />)

    const card = await screen.findByRole('region', { name: 'Riesgo de retraso' })
    expect(await within(card).findByText('Alto · 76/100')).toBeInTheDocument()
    expect(within(card).getByRole('meter', { name: 'Riesgo 76 de 100' })).toHaveAttribute('aria-valuenow', '76')
    const toggle = within(card).getByRole('button', { name: 'Desglose de factores' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const stage = card.querySelector('[data-factor="stage_delay"]') as HTMLElement
    expect(within(stage).getByText('Tiempo en la etapa')).toBeInTheDocument()
    expect(within(stage).getByText('25 pts')).toBeInTheDocument()
    expect(within(stage).getByText(/P90 de la etapa/)).toBeInTheDocument()
    expect(card.querySelector('[data-factor="assignee_load"]')).toHaveTextContent('Sin responsable')
    expect(within(card).getByText('Riesgo estimado por la IA: 84 de 100')).toBeInTheDocument()
    expect(within(card).getByTestId('insight-summary')).toHaveTextContent(
      '<img src=x onerror=alert(1)> Sin responsable y vencida.',
    )
    expect(card.querySelector('img')).toBeNull()
    expect(within(card).getByText('Asignar hoy')).toBeInTheDocument()
    expect(within(card).getByText('Generado por IA: verifica antes de actuar')).toBeInTheDocument()
  })

  it('analiza con IA bajo demanda e indica si el resultado viene de la caché', async () => {
    const requests = mockApi((request) => {
      if (request.method === 'POST') {
        const cached = analysis()
        return jsonResponse({ ...cached, insight: { ...cached.insight, cached: true } })
      }
      return jsonResponse(analysis({ insight: null }))
    })
    const user = userEvent.setup()
    renderInRouter(<RiskCard detail={riskDetail()} />)

    expect(await screen.findByText('Aún no hay un análisis de esta solicitud.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Analizar con IA' }))

    expect(await screen.findByText('Resultado en caché')).toBeInTheDocument()
    expect(requests.some((request) => request.method === 'POST' && request.path === '/api/v1/ai/requests/req-106/analyze?language=es')).toBe(true)
  })

  it('con la IA apagada muestra el nivel 1 y un aviso discreto', async () => {
    mockApi(() =>
      jsonResponse(
        analysis({
          notice: 'ai.disabled',
          insight: {
            ...META,
            id: 'insight-4',
            trigger: 'manual',
            source: 'rule',
            model: null,
            tokens_used: 0,
            fallback_reason: 'ai.disabled',
            content: {
              risk_score: 76,
              summary: coded('ai.rules.request.summary', { code: 'SOL-0106', score: 76, factor: 'sla_consumed' }),
              causes: [coded('ai.rules.cause.unassigned', { status: 'received' })],
              actions: [
                {
                  title: coded('ai.rules.action.assign.title'),
                  detail: coded('ai.rules.action.assign.detail', { code: 'SOL-0106' }),
                },
              ],
            },
          },
        }),
      ),
    )
    renderInRouter(<RiskCard detail={riskDetail()} />)

    const card = await screen.findByRole('region', { name: 'Riesgo de retraso' })
    expect(await within(card).findByRole('status')).toHaveTextContent('La IA está desactivada.')
    expect(within(card).getByTestId('insight-summary')).toHaveTextContent(
      'SOL-0106 tiene un riesgo de 76 sobre 100; el factor principal es sla consumido.',
    )
    expect(within(card).getByText('No tiene responsable en «Recibida».')).toBeInTheDocument()
    expect(within(card).getByText('Asignar un responsable')).toBeInTheDocument()
    expect(within(card).queryByText('Generado por IA: verifica antes de actuar')).toBeNull()
  })
})

describe('riesgo en la lista y estado de la IA', () => {
  it('la lista muestra la columna de riesgo y permite ordenar por ella', async () => {
    const onSort = vi.fn()
    const user = userEvent.setup()
    renderInRouter(
      <RequestTable
        items={[makeRequest({ risk_score: 76 }), makeRequest({ id: 'req-2', code: 'SOL-0002', risk_score: 20 })]}
        loading={false}
        error={null}
        sort="-last_activity_at"
        onSort={onSort}
      />,
    )

    expect(await screen.findByTitle('Riesgo 76 de 100')).toHaveTextContent('Alto76')
    expect(screen.getByTitle('Riesgo 20 de 100')).toHaveTextContent('Bajo20')
    await user.click(screen.getByRole('button', { name: 'Ordenar por Riesgo' }))

    expect(onSort).toHaveBeenCalledWith('risk_score')
  })

  it('la página de IA muestra el consumo del día frente al presupuesto', async () => {
    const status: AIStatus = {
      provider: 'deepseek',
      request_model: 'deepseek-flash',
      overview_model: 'deepseek-v4-pro',
      key_configured: true,
      automatic_enabled: true,
      send_request_text: false,
      tokens_used_today: 4200,
      daily_token_budget: 200000,
      budget_exceeded: false,
      user_hourly_limit: 10,
      last_daily_run: null,
    }
    mockApi(() => jsonResponse(status))
    renderInRouter(<AIStatusPage />)

    expect(await screen.findByTestId('ai-usage')).toHaveTextContent('4200 de 200.000 tokens')
    expect(screen.getByText('DeepSeek')).toBeInTheDocument()
    expect(screen.getByText('deepseek-v4-pro')).toBeInTheDocument()
    expect(screen.getByText('Todavía no se ha ejecutado')).toBeInTheDocument()
  })
})
