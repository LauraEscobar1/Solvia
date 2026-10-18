import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { useRequestBoard } from '@/lib/api/requests'
import type { BoardCard, RequestBoard } from '@/lib/api/types'
import type { RequestFilters } from '@/lib/requests/filters'
import { RequestBoardView } from '@/pages/requests/RequestBoardView'
import { useSessionStore } from '@/stores/session'
import { errorResponse, jsonResponse, makeTokens, makeUser, mockApi } from './fixtures'

vi.mock('@/lib/secureStore', () => ({
  saveRefreshToken: vi.fn(() => Promise.resolve()),
  loadRefreshToken: vi.fn(() => Promise.resolve(null)),
  clearRefreshToken: vi.fn(() => Promise.resolve()),
}))

function card(overrides: Partial<BoardCard>): BoardCard {
  return {
    id: 'card-1',
    code: 'SOL-0001',
    title: 'Impresora sin papel',
    area: { id: 'area-1', name: 'Soporte TI' },
    requester: { id: 'user-2', full_name: 'Carlos' },
    assignee: { id: 'user-3', full_name: 'Andrés' },
    priority: 'high',
    status: 'assigned',
    received_at: '2026-10-10T10:00:00Z',
    due_at: null,
    last_activity_at: '2026-10-12T10:00:00Z',
    completed_at: null,
    risk_score: 30,
    version: 3,
    sla_status: 'on_track',
    is_stalled: false,
    allowed_transitions: [
      { to: 'in_progress', requires_comment: false, requires_assignee: false },
      { to: 'received', requires_comment: true, requires_assignee: false },
    ],
    ...overrides,
  }
}

function board(cards: BoardCard[]): RequestBoard {
  return {
    columns: (['received', 'assigned', 'in_progress', 'completed'] as const).map((status) => {
      const items = cards.filter((item) => item.status === status)
      return { status, total: items.length, items }
    }),
  }
}

const FILTERS: RequestFilters = { status: ['received', 'assigned', 'in_progress', 'completed'], priority: [] }

function Harness() {
  const query = useRequestBoard(FILTERS)
  return <RequestBoardView board={query} filters={FILTERS} />
}

function renderBoard() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function moveWithMenu(user: ReturnType<typeof userEvent.setup>, action: string) {
  await user.click(await screen.findByRole('button', { name: 'Mover SOL-0001 a…' }))
  await user.click(screen.getByRole('menuitem', { name: action }))
}

function column(name: string) {
  return within(screen.getByRole('region', { name: `Columna ${name}` }))
}

describe('tablero kanban', () => {
  it('mueve la tarjeta al instante y la revierte si la API rechaza el cambio', async () => {
    useSessionStore.getState().setSession(makeTokens(makeUser({ role: 'assignee' })), false)
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    mockApi(async (request) => {
      if (request.path.endsWith('/transition')) {
        await gate
        return errorResponse('request.version_conflict', 409)
      }
      return jsonResponse(board([card({})]))
    })
    const user = userEvent.setup()
    renderBoard()

    await screen.findByRole('region', { name: 'Columna Asignada' })
    await moveWithMenu(user, 'Iniciar')

    expect(await column('En proceso').findByText('SOL-0001')).toBeInTheDocument()
    expect(column('Asignada').queryByText('SOL-0001')).toBeNull()

    release()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta solicitud fue modificada por otra persona',
    )
    await waitFor(() => {
      expect(column('Asignada').getByText('SOL-0001')).toBeInTheDocument()
    })
    expect(column('En proceso').queryByText('SOL-0001')).toBeNull()
  })

  it('pide un comentario antes de devolver la solicitud y lo envía con la versión', async () => {
    useSessionStore.getState().setSession(makeTokens(makeUser({ role: 'assignee' })), false)
    const requests = mockApi((request) =>
      request.path.endsWith('/transition')
        ? jsonResponse({})
        : jsonResponse(board([card({})])),
    )
    const user = userEvent.setup()
    renderBoard()

    await moveWithMenu(user, 'Devolver')
    const dialog = within(await screen.findByRole('dialog', { name: 'Devolver · SOL-0001' }))
    await user.click(dialog.getByRole('button', { name: 'Confirmar' }))
    expect(await dialog.findByText('Este campo es obligatorio.')).toBeInTheDocument()
    expect(requests.some((request) => request.path.endsWith('/transition'))).toBe(false)

    await user.type(dialog.getByLabelText('Comentario (obligatorio)'), 'No es de mi área')
    await user.click(dialog.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => {
      expect(requests.find((request) => request.path.endsWith('/transition'))?.body).toEqual({
        to: 'received',
        version: 3,
        comment: 'No es de mi área',
      })
    })
  })

  it('las completadas empiezan colapsadas y cada tarjeta tiene un asa para moverla con el teclado', async () => {
    useSessionStore.getState().setSession(makeTokens(makeUser({ role: 'assignee' })), false)
    mockApi(() => jsonResponse(board([card({}), card({ id: 'card-2', code: 'SOL-0002', status: 'completed', allowed_transitions: [] })])))
    const user = userEvent.setup()
    renderBoard()

    const completed = await screen.findByRole('region', { name: 'Columna Completada' })
    expect(within(completed).queryByText('SOL-0002')).toBeNull()
    const toggle = within(completed).getByRole('button', { name: 'Mostrar Completada' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(within(completed).getByText('SOL-0002')).toBeInTheDocument()
    expect(within(completed).queryByRole('button', { name: 'Arrastrar SOL-0002' })).toBeNull()

    const handle = column('Asignada').getByRole('button', { name: 'Arrastrar SOL-0001' })
    expect(handle).toHaveAttribute('aria-roledescription', 'draggable')
    expect(column('Asignada').getByRole('link', { name: 'Impresora sin papel' }).closest('[role="button"]')).toBeNull()
  })
})
