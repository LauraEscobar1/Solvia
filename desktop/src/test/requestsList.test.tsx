import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { RequestsPage } from '@/pages/requests/RequestsPage'
import { useSessionStore } from '@/stores/session'
import { expectNoA11yViolations } from './a11y'
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
  it('muestra el vencimiento con la prioridad vencida, por vencer y sin movimiento', async () => {
    useSessionStore.getState().setSession(makeTokens(makeUser({ role: 'requester' })), false)
    mockApi((request) => {
      if (request.path.startsWith('/api/v1/requests?')) {
        return jsonResponse({
          items: [
            makeRequest({ id: 'a', code: 'SOL-0001', sla_status: 'overdue' }),
            makeRequest({ id: 'b', code: 'SOL-0002', sla_status: 'at_risk', is_stalled: true }),
            makeRequest({ id: 'c', code: 'SOL-0003', is_stalled: true }),
          ],
          total: 3,
          page: 1,
          size: 20,
        })
      }
      return jsonResponse({ items: [], total: 0, page: 1, size: 100 })
    })
    renderList()

    const row = (code: string) => within((screen.getByText(code).closest('tr') as HTMLElement))
    await screen.findByText('SOL-0001')
    expect(row('SOL-0001').getByText(/^Vencida hace/)).toBeInTheDocument()
    expect(row('SOL-0002').getByText(/^Vence en/)).toBeInTheDocument()
    expect(row('SOL-0003').getByText(/^Sin movimiento/)).toBeInTheDocument()
    expect(screen.getByTestId('requests-count')).toHaveTextContent('3 abiertas')
  })

  it('por defecto muestra las abiertas y «Todas» quita el filtro de etapa', async () => {
    useSessionStore.getState().setSession(makeTokens(makeUser({ role: 'requester' })), false)
    const requests = mockApi(() => jsonResponse({ items: [], total: 42, page: 1, size: 20 }))
    const user = userEvent.setup()
    const router = renderList()

    expect(await screen.findByTestId('requests-count')).toHaveTextContent('42 abiertas')
    const first = requests.find((request) => request.path.startsWith('/api/v1/requests?'))
    expect(first?.path).toContain('status=received&status=assigned&status=in_progress')

    await user.click(screen.getByRole('button', { name: /^Etapa/ }))
    await user.click(screen.getByRole('button', { name: 'Todas' }))

    expect(new URLSearchParams(router.state.location.search).getAll('status')).toEqual(['all'])
    await vi.waitFor(() => {
      expect(screen.getByTestId('requests-count')).toHaveTextContent('42 solicitudes')
    })
    const last = requests.filter((request) => request.path.startsWith('/api/v1/requests?')).at(-1)
    expect(last?.path).not.toContain('status=')
  })

  it('guarda los filtros combinados y el orden en la URL y los envía a la API', async () => {
    useSessionStore.getState().setSession(makeTokens(makeUser({ role: 'requester' })), false)
    const requests = mockApi(() => jsonResponse({ items: [], total: 0, page: 1, size: 20 }))
    const user = userEvent.setup()
    const router = renderList()

    await user.click(await screen.findByRole('button', { name: /^Etapa/ }))
    await user.click(screen.getByRole('checkbox', { name: 'Recibida' }))
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: /^Prioridad/ }))
    await user.click(screen.getByRole('checkbox', { name: 'Crítica' }))
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: /^Más filtros/ }))
    await user.click(screen.getByRole('checkbox', { name: 'Vencidas' }))
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Solo en riesgo' }))
    await user.click(screen.getByRole('button', { name: 'Ordenar por Vencimiento' }))

    const search = new URLSearchParams(router.state.location.search)
    expect(search.getAll('status')).toEqual(['assigned', 'in_progress'])
    expect(search.getAll('priority')).toEqual(['critical'])
    expect(search.get('overdue')).toBe('true')
    expect(search.get('min_risk')).toBe('70')
    expect(search.get('sort')).toBe('due_at')
    expect(screen.getByRole('columnheader', { name: /Vencimiento/ })).toHaveAttribute('aria-sort', 'ascending')
    expect(screen.getByText('4 filtros activos')).toBeInTheDocument()
    const last = requests.filter((request) => request.path.startsWith('/api/v1/requests?')).at(-1)
    expect(last?.path).toContain('status=assigned&status=in_progress')
    expect(last?.path).toContain('priority=critical')
    expect(last?.path).toContain('overdue=true')
    expect(last?.path).toContain('min_risk=70')
    expect(last?.path).toContain('sort=due_at')

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(router.state.location.search).toBe('')
  })

  it('restaura los filtros desde la URL', async () => {
    useSessionStore.getState().setSession(makeTokens(makeUser({ role: 'requester' })), false)
    const requests = mockApi(() => jsonResponse({ items: [], total: 0, page: 1, size: 20 }))
    renderList('/requests?status=completed&q=impresora&sort=-priority')

    expect(await screen.findByRole('button', { name: /^Etapa/ })).toHaveTextContent('Completada')
    expect(screen.getByRole('searchbox', { name: 'Buscar por código o título…' })).toHaveValue('impresora')
    const first = requests.find((request) => request.path.startsWith('/api/v1/requests?'))
    expect(first?.path).toContain('status=completed')
    expect(first?.path).toContain('q=impresora')
    expect(first?.path).toContain('sort=-priority')
  })

  it('no tiene infracciones de axe', async () => {
    useSessionStore.getState().setSession(makeTokens(makeUser({ role: 'supervisor' })), false)
    mockApi((request) =>
      request.path.startsWith('/api/v1/requests?')
        ? jsonResponse({ items: [makeRequest({ assignee: { id: 'u-1', full_name: 'Laura Méndez' } })], total: 1, page: 1, size: 20 })
        : jsonResponse({ items: [], total: 0, page: 1, size: 100 }),
    )
    renderList()

    await screen.findByText('SOL-0001')
    await expectNoA11yViolations()
  })
})
