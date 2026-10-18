import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

async function openAccountMenu() {
  await userEvent.setup().click(screen.getByRole('button', { name: 'Menú de la cuenta' }))
  return within(screen.getByRole('menu', { name: 'Menú de la cuenta' }))
}

describe('protección de rutas', () => {
  beforeEach(() => {
    mockApi((request) => {
      if (request.path.startsWith('/api/v1/health')) return jsonResponse(HEALTH_OK)
      if (request.path.startsWith('/api/v1/sla-policies')) return jsonResponse([])
      if (request.path.startsWith('/api/v1/dashboard')) {
        return jsonResponse({ error: { code: 'common.internal_error', params: {} } }, 500)
      }
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

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('oculta Administración y bloquea sus rutas a quien no es admin', async () => {
    signInAs(makeUser({ role: 'requester' }))
    const router = renderAt('/admin/users')

    expect(await screen.findByRole('heading', { level: 1, name: 'Hola, Ana' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(mainNavigation().getByRole('link', { name: 'Solicitudes' })).toBeInTheDocument()
    const menu = await openAccountMenu()
    expect(menu.getByRole('menuitem', { name: 'Configuración' })).toBeInTheDocument()
    expect(menu.queryByRole('group', { name: 'Administración' })).toBeNull()
  })

  it('el supervisor tampoco ve Administración', async () => {
    signInAs(makeUser({ role: 'supervisor' }))
    const router = renderAt('/admin/sla')

    expect(await screen.findByRole('heading', { level: 1, name: 'Hola, Ana' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    const menu = await openAccountMenu()
    expect(menu.queryByRole('menuitem', { name: 'Usuarios' })).toBeNull()
  })

  it('permite al admin entrar a Administración', async () => {
    signInAs(makeUser({ role: 'admin' }))
    const router = renderAt('/admin')

    expect(await screen.findByRole('heading', { level: 1, name: 'Administración' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/users')
    expect(await screen.findByRole('button', { name: /Nuevo usuario/ })).toBeInTheDocument()
    const admin = within((await openAccountMenu()).getByRole('group', { name: 'Administración' }))
    expect(admin.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Usuarios',
      'Áreas',
      'SLA',
      'IA',
    ])
  })

  it('obliga a cambiar una contraseña temporal antes de continuar', async () => {
    signInAs(makeUser({ must_change_password: true }))
    const router = renderAt('/settings')

    expect(await screen.findByRole('heading', { name: 'Cambia tu contraseña' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/change-password')
  })
})
