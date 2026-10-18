import type { Page, Route } from '@playwright/test'

export const API = 'http://localhost:8000'
export const ACCOUNT = { email: 'ana@example.com', password: 'contraseña-de-prueba' }

const HOUR = 3600 * 1000
const now = Date.now()
const ago = (hours: number) => new Date(now - hours * HOUR).toISOString()
const ahead = (hours: number) => new Date(now + hours * HOUR).toISOString()
const day = (offset: number) => new Date(now - offset * 24 * HOUR).toISOString().slice(0, 10)

const SUPPORT = { id: 'area-1', name: 'Soporte TI' }
const FINANCE = { id: 'area-2', name: 'Finanzas' }
const LAURA = { id: 'user-3', full_name: 'Laura Méndez' }
const CARLOS = { id: 'user-4', full_name: 'Carlos Vega' }
const PABLO = { id: 'user-5', full_name: 'Pablo Ortiz' }

export function adminUser(theme: 'light' | 'dark') {
  return {
    id: 'user-1',
    full_name: 'Ana Administradora',
    email: ACCOUNT.email,
    role: 'admin',
    area: null,
    language: 'es',
    theme,
    is_active: true,
    must_change_password: false,
    last_login_at: ago(2),
    created_at: ago(900),
    updated_at: ago(2),
  }
}

function request(id: string, overrides: Record<string, unknown>) {
  return {
    id,
    code: `SOL-${id.slice(4).padStart(4, '0')}`,
    title: 'Solicitud de prueba',
    area: SUPPORT,
    requester: CARLOS,
    assignee: null,
    priority: 'medium',
    status: 'received',
    received_at: ago(30),
    due_at: ahead(20),
    last_activity_at: ago(3),
    completed_at: null,
    version: 3,
    sla_status: 'on_track',
    is_stalled: false,
    risk_score: 24,
    ...overrides,
  }
}

const REQUESTS = [
  request('req-81', {
    title: 'Reembolso de matrícula por doble cobro',
    area: FINANCE,
    assignee: LAURA,
    priority: 'critical',
    status: 'assigned',
    received_at: ago(150),
    due_at: ago(26),
    last_activity_at: ago(140),
    sla_status: 'overdue',
    is_stalled: true,
    risk_score: 91,
  }),
  request('req-77', { title: 'Acceso a la VPN', priority: 'high', status: 'in_progress', assignee: PABLO, due_at: ahead(5), sla_status: 'at_risk', risk_score: 74 }),
  request('req-63', { title: 'Aire acondicionado del aula 3', priority: 'medium', status: 'assigned', assignee: LAURA, risk_score: 48 }),
  request('req-52', { title: 'Cambio de horario', priority: 'low', risk_score: 12 }),
  request('req-40', { title: 'Certificado laboral', status: 'completed', completed_at: ago(10), due_at: null, risk_score: 0 }),
]

const TRANSITIONS = [
  { to: 'in_progress', requires_assignee: false, requires_comment: false },
  { to: 'received', requires_assignee: false, requires_comment: true },
  { to: 'cancelled', requires_assignee: false, requires_comment: true },
]

const message = (text: string) => ({ text, code: null, params: {} })

const INSIGHT_META = {
  source: 'ai',
  trigger: 'manual',
  language: 'es',
  provider: 'deepseek',
  model: 'deepseek-flash',
  tokens_used: 820,
  fallback_reason: null,
  cached: false,
  created_at: ago(4),
  feedback: {},
}

const RISK = {
  score: 91,
  factors: [
    { factor: 'stage_delay', value: 144, reference: 24, reference_kind: 'p90_area_stage_priority', normalized: 1, weight: 0.25, points: 25 },
    { factor: 'sla_consumed', value: 1.4, reference: null, reference_kind: null, normalized: 0.93, weight: 0.3, points: 28 },
    { factor: 'inactivity', value: 140, reference: 12, reference_kind: null, normalized: 1, weight: 0.2, points: 20 },
    { factor: 'priority', value: 'critical', reference: null, reference_kind: null, normalized: 1, weight: 0.15, points: 15 },
    { factor: 'assignee_load', value: 14, reference: null, reference_kind: null, normalized: 0.3, weight: 0.1, points: 3 },
  ],
}

const OVERVIEW = {
  area_id: null,
  notice: null,
  insight: {
    ...INSIGHT_META,
    id: 'overview-1',
    area_id: null,
    content: {
      summary: message('Finanzas acumula solicitudes asignadas sin movimiento y dos vencerán hoy.'),
      findings: [{ type: 'bottleneck', area_id: FINANCE.id, status: 'assigned', evidence: message('Seis solicitudes llevan más de tres días en Asignada.') }],
      recommendations: [
        { title: message('Redistribuir la carga de Finanzas'), detail: message('Reasignar dos solicitudes de Laura Méndez.'), priority: 'high', target: null },
        { title: message('Revisar SOL-0081'), detail: message('Contactar al solicitante para cerrar el reembolso.'), priority: 'medium', target: null },
      ],
    },
  },
}

const ALERTS = [
  {
    id: 'alert-1',
    type: 'overdue',
    severity: 'critical',
    source: 'rule',
    message_code: 'alert.overdue',
    params: { code: 'SOL-0081', due_at: ago(26) },
    area: FINANCE,
    request: { id: 'req-81', code: 'SOL-0081', title: 'Reembolso de matrícula por doble cobro', status: 'assigned' },
    is_read: false,
    created_at: ago(1),
    resolved_at: null,
  },
  {
    id: 'alert-2',
    type: 'due_soon',
    severity: 'warning',
    source: 'rule',
    message_code: 'alert.due_soon',
    params: { code: 'SOL-0077', due_at: ahead(5) },
    area: SUPPORT,
    request: { id: 'req-77', code: 'SOL-0077', title: 'Acceso a la VPN', status: 'in_progress' },
    is_read: true,
    created_at: ago(20),
    resolved_at: null,
  },
  {
    id: 'alert-3',
    type: 'bottleneck',
    severity: 'warning',
    source: 'rule',
    message_code: 'alert.bottleneck',
    params: { area_id: FINANCE.id, status: 'assigned', count: 6, avg_hours: 80, reasons: ['count_above_median'] },
    area: FINANCE,
    request: null,
    is_read: false,
    created_at: ago(30),
    resolved_at: null,
  },
]

function page<T>(items: T[], size = 10) {
  return { items, total: items.length, page: 1, size }
}

function respond(method: string, path: string, search: URLSearchParams, theme: 'light' | 'dark'): unknown {
  const user = adminUser(theme)
  if (path === '/api/v1/health') {
    return {
      status: 'ok',
      version: '0.1.0',
      environment: 'development',
      database: { status: 'ok' },
      ai: { provider: 'deepseek', model: 'deepseek-flash', configured: true },
      organization: { name: 'Universidad de Prueba' },
    }
  }
  if (path === '/api/v1/auth/login' || path === '/api/v1/auth/refresh') {
    return { access_token: 'access', token_type: 'bearer', expires_in: 1800, refresh_token: 'refresh', refresh_expires_at: ahead(720), user }
  }
  if (path === '/api/v1/auth/me') return user
  if (path === '/api/v1/dashboard/summary') {
    return {
      open: 128,
      due_soon: 14,
      overdue: 9,
      stalled: 11,
      completed_last_7_days: 17,
      completed_since: day(6),
      avg_resolution_hours: 61.4,
      open_areas: 5,
      overdue_change: 3,
      high_risk: 3,
      due_soon_high_risk: 6,
      stalled_forgotten: 2,
      open_by_stage: { received: 34, assigned: 41, in_progress: 53 },
      range: { date_from: day(29), date_to: day(0), timezone: 'America/Bogota' },
    }
  }
  if (path === '/api/v1/dashboard/trends') {
    return {
      days: Array.from({ length: 30 }, (_, index) => ({ day: day(29 - index), created: 20 + ((index * 7) % 13), completed: 18 + ((index * 5) % 11) })),
      range: { date_from: day(29), date_to: day(0), timezone: 'America/Bogota' },
    }
  }
  if (path === '/api/v1/dashboard/stage-flow') {
    return {
      stages: [
        { status: 'received', count: 34, median_hours: 14, target_hours: 24 },
        { status: 'assigned', count: 41, median_hours: 43, target_hours: 24 },
        { status: 'in_progress', count: 53, median_hours: 70, target_hours: 96 },
      ],
    }
  }
  if (path === '/api/v1/dashboard/bottlenecks') {
    const cell = (area: typeof SUPPORT, status: string, avg: number, flagged: boolean) => ({
      area,
      status,
      count: 6,
      avg_hours: avg,
      median_count: 4,
      median_avg_hours: 20,
      sla_max_hours: 48,
      is_bottleneck: flagged,
      reasons: flagged ? ['count_above_median'] : [],
    })
    return {
      cells: [
        cell(FINANCE, 'received', 18, false),
        cell(FINANCE, 'assigned', 52, true),
        cell(FINANCE, 'in_progress', 28, false),
        cell(SUPPORT, 'received', 16, false),
        cell(SUPPORT, 'assigned', 22, false),
        cell(SUPPORT, 'in_progress', 30, false),
      ],
    }
  }
  if (path === '/api/v1/ai/overview') return OVERVIEW
  if (path === '/api/v1/ai/status') {
    return {
      provider: 'deepseek',
      request_model: 'deepseek-flash',
      overview_model: 'deepseek-pro',
      key_configured: true,
      automatic_enabled: true,
      send_request_text: false,
      tokens_used_today: 42000,
      daily_token_budget: 200000,
      budget_exceeded: false,
      user_hourly_limit: 20,
      last_daily_run: { created_at: ago(8), source: 'ai', fallback_reason: null, tokens_used: 5200 },
    }
  }
  const insight = /^\/api\/v1\/ai\/requests\/([^/]+)\/insight$/.exec(path)
  if (insight) {
    return {
      request_id: insight[1],
      notice: null,
      risk: RISK,
      insight: {
        ...INSIGHT_META,
        id: 'insight-1',
        status: 'assigned',
        content: {
          risk_score: 88,
          summary: message('La solicitud superó su SLA y no tiene actividad desde hace seis días.'),
          causes: [message('SLA consumido al 140 %.'), message('Sin comentarios desde la asignación.')],
          actions: [{ title: message('Contactar a la responsable'), detail: message('Confirmar el estado del reembolso hoy.') }],
        },
      },
    }
  }
  if (path === '/api/v1/requests/due-estimates') {
    return [
      { priority: 'low', hours: 120 },
      { priority: 'medium', hours: 72 },
      { priority: 'high', hours: 48 },
      { priority: 'critical', hours: 24 },
    ]
  }
  if (path === '/api/v1/requests/board') {
    return {
      columns: ['received', 'assigned', 'in_progress', 'completed'].map((status) => {
        const items = REQUESTS.filter((item) => item.status === status).map((item) => ({ ...item, allowed_transitions: TRANSITIONS }))
        return { status, total: items.length, items }
      }),
    }
  }
  if (path === '/api/v1/requests') {
    const open = search.has('status') ? REQUESTS : REQUESTS.filter((item) => item.status !== 'completed')
    return page(search.get('sort') === '-risk_score' ? [...open].sort((a, b) => Number(b.risk_score) - Number(a.risk_score)) : open)
  }
  const detail = /^\/api\/v1\/requests\/([^/]+)(\/[a-z-]+)?$/.exec(path)
  if (detail) {
    const found = REQUESTS.find((item) => item.id === detail[1]) ?? REQUESTS[0]
    switch (detail[2]) {
      case '/events':
        return page(
          [
            { id: 'event-2', type: 'assigned', from_status: 'received', to_status: 'assigned', actor: CARLOS, comment: null, details: { assignee_name: 'Laura Méndez' }, created_at: ago(140) },
            { id: 'event-1', type: 'created', from_status: null, to_status: 'received', actor: CARLOS, comment: null, details: {}, created_at: ago(150) },
          ],
          20,
        )
      case '/stages':
        return {
          current: found?.status ?? 'assigned',
          stages: [
            { status: 'received', hours: 10, entered_at: ago(150), visits: 1 },
            { status: 'assigned', hours: 140, entered_at: ago(140), visits: 1 },
          ],
        }
      case '/assignment-suggestion':
        return { suggestion: { assignee: PABLO, open_count: 5, current_open_count: 14 } }
      default:
        return {
          ...found,
          description: 'Se registró un doble cobro de la matrícula y se solicita el reembolso del segundo cargo.',
          created_at: found?.received_at,
          updated_at: found?.last_activity_at,
          allowed_transitions: TRANSITIONS,
          permissions: { editable_fields: ['title', 'description', 'priority', 'due_at'], can_assign: true, can_comment: true },
        }
    }
  }
  if (path === '/api/v1/alerts/unread-count') return { count: 2 }
  if (path === '/api/v1/alerts') return page(ALERTS, 20)
  if (path === '/api/v1/sla-policies') {
    return ['low', 'medium', 'high', 'critical'].flatMap((priority, row) =>
      ['received', 'assigned', 'in_progress'].map((status, column) => ({
        priority,
        status,
        max_hours: (4 - row) * 8 * (column + 1),
        inactivity_hours: (4 - row) * 4,
        updated_at: ago(400),
      })),
    )
  }
  if (path === '/api/v1/areas') {
    return page([
      { ...FINANCE, description: 'Pagos, reembolsos y facturación', manager: LAURA, is_active: true, created_at: ago(900), updated_at: ago(100) },
      { ...SUPPORT, description: 'Equipos, redes y cuentas', manager: PABLO, is_active: true, created_at: ago(900), updated_at: ago(100) },
      { id: 'area-3', name: 'Mantenimiento', description: null, manager: null, is_active: false, created_at: ago(900), updated_at: ago(100) },
    ])
  }
  if (path === '/api/v1/users') {
    return page([
      user,
      { ...user, id: LAURA.id, full_name: LAURA.full_name, email: 'laura@example.com', role: 'assignee', area: FINANCE, last_login_at: ago(30) },
      { ...user, id: CARLOS.id, full_name: CARLOS.full_name, email: 'carlos@example.com', role: 'requester', area: null, is_active: false, last_login_at: null },
    ])
  }
  return method === 'GET' ? page([]) : {}
}

export async function mockApi(target: Page, theme: 'light' | 'dark'): Promise<void> {
  await target.route(`${API}/api/v1/**`, async (route: Route) => {
    const incoming = route.request()
    const headers = {
      'access-control-allow-origin': (await incoming.headerValue('origin')) ?? '*',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    }
    if (incoming.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const url = new URL(incoming.url())
    return route.fulfill({ status: 200, headers, json: respond(incoming.method(), url.pathname, url.searchParams, theme) })
  })
}
