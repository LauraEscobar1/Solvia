import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { RequestsPage } from '@/pages/requests/RequestsPage'
import { useSessionStore } from '@/stores/session'
import { jsonResponse, makeRequest, makeTokens, makeUser, mockApi } from './fixtures'

vi.mock('@/lib/secureStore', () => ({
  saveRefreshToken: vi.fn(() => Promise.resolve()),
  loadRefreshToken: vi.fn(() => Promise.resolve(null)),
  clearRefreshToken: vi.fn(() => Promise.resolve()),
}))

function renderList(path = '/requests') {
  const router = createMemoryRouter([{ path: '/requests', Component: RequestsPage }], {
    initialEntries: [path],
  })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

describe('lista de solicitudes', () => {
  it('muestra indicadores de vencida, por vencer y sin movimiento', async () => {
    useSessionStore.getState().setSession(makeTokens(makeUser({ role: 'requester' })), false)
    mockApi((request) => {
      if (request.path.startsWith('/api/v1/requests?')) {
        return jsonResponse({
          items: [
            makeRequest({ id: 'a', code: 'SOL-0001', sla_status: 'overdue' }),
            makeRequest({ id: 'b', code: 'SOL-0002', sla_status: 'at_risk', is_stalled: true }),
          ],
          total: 2,
          page: 1,
          size: 20,
        })
      }
      return jsonResponse({ items: [], total: 0, page: 1, size: 100 })
    })
    renderList()

    const overdueRow = (await screen.findByText('SOL-0001')).closest('tr')
    const atRiskRow = screen.getByText('SOL-0002').closest('tr')
    expect(overdueRow).not.toBeNull()
    expect(atRiskRow).not.toBeNull()
    expect(within(overdueRow as HTMLElement).getAllByText('Vencida').length).toBeGreaterThan(0)
    expect(within(atRiskRow as HTMLElement).getAllByText('Por vencer').length).toBeGreaterThan(0)
    expect(within(atRiskRow as HTMLElement).getByRole('img', { name: 'Sin movimiento' })).toBeInTheDocument()
  })

  it('guarda los filtros combinados y el orden en la URL y los envía a la API', async () => {
    useSessionStore.getState().setSession(makeTokens(makeUser({ role: 'requester' })), false)
    const requests = mockApi(() => jsonResponse({ items: [], total: 0, page: 1, size: 20 }))
    const user = userEvent.setup()
    const router = renderList()

    await user.click(await screen.findByRole('button', { name: 'En proceso' }))
    await user.click(screen.getByRole('button', { name: 'Asignada' }))
    await user.click(screen.getByRole('button', { name: 'Crítica' }))
    await user.click(screen.getByLabelText('Solo vencidas'))
    await user.click(screen.getByRole('button', { name: 'Ordenar por Fecha límite' }))

    const search = new URLSearchParams(router.state.location.search)
    expect(search.getAll('status')).toEqual(['in_progress', 'assigned'])
    expect(search.getAll('priority')).toEqual(['critical'])
    expect(search.get('overdue')).toBe('true')
    expect(search.get('sort')).toBe('due_at')
    const last = requests.filter((request) => request.path.startsWith('/api/v1/requests?')).at(-1)
    expect(last?.path).toContain('status=in_progress&status=assigned')
    expect(last?.path).toContain('priority=critical')
    expect(last?.path).toContain('overdue=true')
    expect(last?.path).toContain('sort=due_at')
  })

  it('restaura los filtros desde la URL', async () => {
    useSessionStore.getState().setSession(makeTokens(makeUser({ role: 'requester' })), false)
    const requests = mockApi(() => jsonResponse({ items: [], total: 0, page: 1, size: 20 }))
    renderList('/requests?status=completed&q=impresora&sort=-priority')

    expect(await screen.findByRole('button', { name: 'Completada' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const first = requests.find((request) => request.path.startsWith('/api/v1/requests?'))
    expect(first?.path).toContain('status=completed')
    expect(first?.path).toContain('q=impresora')
    expect(first?.path).toContain('sort=-priority')
  })
})
