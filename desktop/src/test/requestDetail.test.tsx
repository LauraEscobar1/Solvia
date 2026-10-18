import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
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
import { expectNoA11yViolations } from './a11y'

vi.mock('@/lib/secureStore', () => ({
  saveRefreshToken: vi.fn(() => Promise.resolve()),
  loadRefreshToken: vi.fn(() => Promise.resolve(null)),
  clearRefreshToken: vi.fn(() => Promise.resolve()),
}))

const DETAIL_PATH = '/api/v1/requests/req-1'


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
  return within(screen.getByRole('group', { name: 'Acciones' }))
}

describe('detalle de solicitud', () => {
  it('la siguiente transición es la acción principal y las demás quedan como secundarias', async () => {
    useSessionStore.getState().setSession(makeTokens(makeUser({ role: 'assignee' })), false)
    renderDetail(() => jsonResponse(makeDetail()))

    expect(await screen.findByRole('heading', { level: 1, name: 'Impresora sin papel' })).toBeInTheDocument()
    const buttons = actionsRegion()
      .getAllByRole('button')
      .map((button) => button.textContent)
    expect(buttons).toEqual(['Retroceder', 'Mover a Completada'])
    expect(screen.queryByRole('button', { name: 'Reasignar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancelar solicitud' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    expect(screen.getByText('Prioridad Alta')).toBeInTheDocument()
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

  it('confirma antes de cancelar la solicitud', async () => {
    useSessionStore.getState().setSession(makeTokens(makeUser({ role: 'supervisor' })), false)
    const requests = renderDetail(() =>
      jsonResponse(
        makeDetail({
          allowed_transitions: [
            { to: 'completed', requires_comment: false, requires_assignee: false },
            { to: 'cancelled', requires_comment: false, requires_assignee: false },
          ],
        }),
      ),
    )
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Cancelar solicitud' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Cancelar SOL-0007' }))
    await user.click(dialog.getByRole('button', { name: 'Volver' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(requests.some((request) => request.path.endsWith('/transition'))).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Cancelar solicitud' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar solicitud' }))
    await waitFor(() => {
      expect(requests.find((request) => request.path.endsWith('/transition'))?.body).toEqual({
        to: 'cancelled',
        version: 4,
      })
    })
  })

  it('edita en un diálogo y ante un 409 recarga conservando lo que escribió el usuario', async () => {
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

    await user.click(await screen.findByRole('button', { name: 'Editar' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Editar SOL-0007' }))
    const title = dialog.getByLabelText('Título')
    await user.clear(title)
    await user.type(title, 'Impresora del segundo piso')
    await user.click(dialog.getByRole('button', { name: 'Guardar cambios' }))

    expect(await dialog.findByRole('alert')).toHaveTextContent('Esta solicitud fue modificada por otra persona')
    await waitFor(() => {
      expect(dialog.getByLabelText('Prioridad')).toHaveValue('critical')
    })
    expect(dialog.getByLabelText('Título')).toHaveValue('Impresora del segundo piso')

    await user.click(dialog.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => {
      expect(requests.filter((request) => request.method === 'PATCH').at(-1)?.body).toEqual({
        version: 5,
        title: 'Impresora del segundo piso',
      })
    })
  })

  it('muestra el paso a paso con el tiempo en cada etapa', async () => {
    useSessionStore.getState().setSession(makeTokens(makeUser({ role: 'requester' })), false)
    renderDetail((request) =>
      request.path === `${DETAIL_PATH}/stages`
        ? jsonResponse({
            current: 'in_progress',
            stages: [
              { status: 'received', hours: 0.5, entered_at: '2026-10-10T10:00:00Z', visits: 1 },
              { status: 'assigned', hours: 20, entered_at: '2026-10-10T10:30:00Z', visits: 1 },
              { status: 'in_progress', hours: 144, entered_at: '2026-10-11T06:30:00Z', visits: 1 },
            ],
          })
        : jsonResponse(makeDetail({ allowed_transitions: [] })),
    )

    const steps = within(await screen.findByRole('list', { name: 'Etapas de la solicitud' }))
    await waitFor(() => {
      expect(steps.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
        'Paso 1RecibidaCompletada · menos de 1 h',
        'Paso 2AsignadaCompletada · 20 h',
        'Paso 3En procesoActual · 6 días',
        'Paso 4CompletadaPendiente',
      ])
    })
    expect(steps.getAllByRole('listitem')[2]).toHaveAttribute('aria-current', 'step')
  })

  it('muestra el historial en orden y envía comentarios', async () => {
    useSessionStore.getState().setSession(makeTokens(makeUser({ role: 'requester' })), false)
    const requests = renderDetail((request) =>
      request.method === 'POST' ? jsonResponse(EVENTS[0]) : jsonResponse(makeDetail({ allowed_transitions: [] })),
    )
    const user = userEvent.setup()

    const timeline = within(await screen.findByRole('list', { name: 'Historial y comentarios' }))
    expect(timeline.getAllByTestId('event-headline').map((item) => item.textContent)).toEqual([
      'Carlos creó la solicitud',
      'Sofía asignó la solicitud a Andrés',
    ])
    expect(timeline.getAllByRole('time')[0]).toHaveAttribute('dateTime', '2026-10-10T10:00:00Z')

    await user.type(screen.getByLabelText('Nuevo comentario'), 'Ya cambié el tóner')
    await user.click(screen.getByRole('button', { name: 'Enviar' }))
    await waitFor(() => {
      expect(requests.find((request) => request.path.endsWith('/comments'))?.body).toEqual({
        comment: 'Ya cambié el tóner',
      })
    })
  })

  it('no tiene infracciones de axe', async () => {
    useSessionStore.getState().setSession(makeTokens(makeUser({ role: 'supervisor' })), false)
    renderDetail(() => jsonResponse(makeDetail()))

    await screen.findByRole('list', { name: 'Historial y comentarios' })
    await expectNoA11yViolations()
  })
})
