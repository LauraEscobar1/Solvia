import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/lib/api/types'
import { routes } from '@/router'
import { useSessionStore } from '@/stores/session'
import { EMPTY_PAGE, HEALTH_OK, jsonResponse, makeTokens, makeUser, mockApi } from './fixtures'

vi.mock('@/lib/secureStore', () => ({
  saveRefreshToken: vi.fn(() => Promise.resolve()),
  loadRefreshToken: vi.fn(() => Promise.resolve(null)),
  clearRefreshToken: vi.fn(() => Promise.resolve()),
}))

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

function signInAs(user: User) {
  useSessionStore.getState().setSession(makeTokens(user), false)
}

function mainNavigation() {
  return within(screen.getByRole('navigation', { name: 'Navegación principal' }))
}

describe('protección de rutas', () => {
  beforeEach(() => {
    mockApi((request) => {
      if (request.path.startsWith('/api/v1/health')) return jsonResponse(HEALTH_OK)
      if (request.path.startsWith('/api/v1/sla-policies')) return jsonResponse([])
      return jsonResponse(EMPTY_PAGE)
    })
  })

  it('muestra un estado de carga mientras se restaura la sesión', () => {
    useSessionStore.setState({ status: 'loading' })
    renderAt('/')

    expect(screen.getByText('Comprobando tu sesión…')).toBeInTheDocument()
  })

  it('envía al login a quien no ha iniciado sesión', async () => {
    const router = renderAt('/admin/users')

    expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('oculta Administración y bloquea sus rutas a quien no es admin', async () => {
    signInAs(makeUser({ role: 'requester' }))
    const router = renderAt('/admin/users')

    expect(await screen.findByRole('heading', { level: 1, name: 'Panel' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(mainNavigation().getByRole('link', { name: 'Solicitudes' })).toBeInTheDocument()
    expect(mainNavigation().queryByRole('link', { name: 'Administración' })).toBeNull()
  })

  it('el supervisor tampoco ve Administración', async () => {
    signInAs(makeUser({ role: 'supervisor' }))
    const router = renderAt('/admin/sla')

    expect(await screen.findByRole('heading', { level: 1, name: 'Panel' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(mainNavigation().queryByRole('link', { name: 'Administración' })).toBeNull()
  })

  it('permite al admin entrar a Administración', async () => {
    signInAs(makeUser({ role: 'admin' }))
    renderAt('/admin')

    expect(await screen.findByRole('link', { name: 'Usuarios' })).toBeInTheDocument()
    expect(mainNavigation().getByRole('link', { name: 'Administración' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Nueva área/ })).toBeInTheDocument()
  })

  it('obliga a cambiar una contraseña temporal antes de continuar', async () => {
    signInAs(makeUser({ must_change_password: true }))
    const router = renderAt('/settings')

    expect(await screen.findByRole('heading', { name: 'Cambia tu contraseña' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/change-password')
  })
})
