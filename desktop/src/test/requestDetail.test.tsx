import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RequestDetail, RequestEvent } from '@/lib/api/types'
import { RequestDetailPage } from '@/pages/requests/detail/RequestDetailPage'
import { useSessionStore } from '@/stores/session'
import {
  errorResponse,
  jsonResponse,
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

const DETAIL_PATH = '/api/v1/requests/req-1'

afterEach(() => {
  vi.useRealTimers()
})

function makeDetail(overrides: Partial<RequestDetail> = {}): RequestDetail {
  return {
    id: 'req-1',
    code: 'SOL-0007',
    title: 'Impresora sin papel',
    description: 'La impresora del segundo piso no imprime.',
    area: { id: 'area-1', name: 'Soporte TI' },
    requester: { id: 'user-2', full_name: 'Carlos' },
    assignee: { id: 'user-3', full_name: 'Andrés' },
    priority: 'high',
    status: 'in_progress',
    received_at: '2026-10-10T10:00:00Z',
    due_at: '2026-10-14T18:00:00Z',
    last_activity_at: '2026-10-12T10:00:00Z',
    completed_at: null,
    version: 4,
    sla_status: 'on_track',
    is_stalled: false,
    risk_score: 45,
    created_at: '2026-10-10T10:00:00Z',
    updated_at: '2026-10-12T10:00:00Z',
    allowed_transitions: [
      { to: 'completed', requires_comment: false, requires_assignee: false },
      { to: 'assigned', requires_comment: true, requires_assignee: false },
    ],
    permissions: { editable_fields: [], can_assign: false, can_comment: true },
    ...overrides,
  }
}

const EVENTS: RequestEvent[] = [
  {
    id: 'ev-2',
    type: 'assigned',
    from_status: 'received',
    to_status: 'assigned',
    actor: { id: 'user-4', full_name: 'Sofía' },
    comment: null,
    details: { assignee_name: 'Andrés', previous_assignee_name: null, area_override: false },
    created_at: '2026-10-11T10:00:00Z',
  },
  {
    id: 'ev-1',
    type: 'created',
    from_status: null,
    to_status: 'received',
    actor: { id: 'user-2', full_name: 'Carlos' },
    comment: null,
    details: {},
    created_at: '2026-10-10T10:00:00Z',
  },
]

function renderDetail(handler: (request: RecordedRequest) => Response | Promise<Response>) {
  const requests = mockApi((request) => {
    if (request.path.startsWith(`${DETAIL_PATH}/events`)) {
      return jsonResponse({ items: EVENTS, total: EVENTS.length, page: 1, size: 20 })
    }
    return handler(request)
  })
  const router = createMemoryRouter([{ path: '/requests/:requestId', Component: RequestDetailPage }], {
    initialEntries: ['/requests/req-1'],
  })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return requests
}

function actionsRegion() {
  return within(screen.getByRole('region', { name: 'Acciones' }))
}

describe('detalle de solicitud', () => {
  it('genera los botones a partir de allowed_transitions', async () => {
    useSessionStore.getState().setSession(makeTokens(makeUser({ role: 'assignee' })), false)
    renderDetail(() => jsonResponse(makeDetail()))

    expect(await screen.findByRole('heading', { name: 'Impresora sin papel' })).toBeInTheDocument()
    const buttons = actionsRegion()
      .getAllByRole('button')
      .map((button) => button.textContent)
    expect(buttons).toEqual(['Completar', 'Retroceder'])
    expect(screen.queryByRole('button', { name: 'Reasignar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancelar solicitud' })).toBeNull()
  })

  it('pide comentario obligatorio y envía la transición con la versión actual', async () => {
    useSessionStore.getState().setSession(makeTokens(makeUser({ role: 'assignee' })), false)
    const requests = renderDetail((request) =>
      request.path.endsWith('/transition')
        ? jsonResponse(makeDetail({ status: 'assigned', version: 5, allowed_transitions: [] }))
        : jsonResponse(makeDetail()),
    )
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Retroceder' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Retroceder · SOL-0007' }))
    await user.click(dialog.getByRole('button', { name: 'Confirmar' }))
    expect(await dialog.findByText('Este campo es obligatorio.')).toBeInTheDocument()

    await user.type(dialog.getByLabelText('Comentario (obligatorio)'), 'Falta un repuesto')
    await user.click(dialog.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(requests.find((request) => request.path.endsWith('/transition'))?.body).toEqual({
      to: 'assigned',
      version: 4,
      comment: 'Falta un repuesto',
    })
  })

  it('ante un 409 avisa, recarga y conserva solo lo que escribió el usuario', async () => {
    useSessionStore.getState().setSession(makeTokens(makeUser({ role: 'supervisor' })), false)
    let version = 4
    const requests = renderDetail((request) => {
      if (request.method === 'PATCH') {
        version = 5
        return errorResponse('request.version_conflict', 409)
      }
      return jsonResponse(
        makeDetail({
          version,
          priority: version === 5 ? 'critical' : 'high',
          permissions: {
            editable_fields: ['description', 'due_at', 'priority', 'title'],
            can_assign: true,
            can_comment: true,
          },
        }),
      )
    })
    const user = userEvent.setup()

    const title = await screen.findByLabelText('Título')
    await user.clear(title)
    await user.type(title, 'Impresora del segundo piso')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta solicitud fue modificada por otra persona',
    )
    await waitFor(() => {
      expect(screen.getByLabelText('Prioridad')).toHaveValue('critical')
    })
    expect(screen.getByLabelText('Título')).toHaveValue('Impresora del segundo piso')
    await waitFor(() => {
      expect(
        requests.filter((request) => request.method === 'GET' && request.path === DETAIL_PATH)
          .length,
      ).toBeGreaterThanOrEqual(2)
    })

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => {
      expect(requests.filter((request) => request.method === 'PATCH').at(-1)?.body).toEqual({
        version: 5,
        title: 'Impresora del segundo piso',
      })
    })
  })

  it('muestra la línea de tiempo con nombres y fechas relativas', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-15T12:00:00Z'))
    useSessionStore.getState().setSession(makeTokens(makeUser({ role: 'requester' })), false)
    renderDetail(() => jsonResponse(makeDetail({ allowed_transitions: [] })))

    const timeline = within(await screen.findByRole('list', { name: 'Historial' }))
    expect(await timeline.findByText('Sofía asignó la solicitud a Andrés')).toBeInTheDocument()
    expect(timeline.getByText('Carlos creó la solicitud')).toBeInTheDocument()
    expect(timeline.getAllByText(/^hace /).length).toBe(2)
  })
})
