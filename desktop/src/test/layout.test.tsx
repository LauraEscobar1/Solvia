import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AppLayout } from '@/components/layout/AppLayout'
import type { User } from '@/lib/api/types'
import { useSessionStore } from '@/stores/session'
import { expectNoA11yViolations } from './a11y'
import { jsonResponse, makeTokens, makeUser, mockApi } from './fixtures'

vi.mock('@/lib/secureStore', () => ({
  saveRefreshToken: vi.fn(() => Promise.resolve()),
  loadRefreshToken: vi.fn(() => Promise.resolve(null)),
  clearRefreshToken: vi.fn(() => Promise.resolve()),
}))

function renderLayout(user: User) {
  useSessionStore.getState().setSession(makeTokens(user), false)
  mockApi(() => jsonResponse({ count: 3 }))
  const router = createMemoryRouter(
    [
      {
        path: '/',
        Component: AppLayout,
        children: [
          { index: true, element: <h1>Panel</h1> },
          { path: 'settings', element: <h1>Configuración</h1> },
        ],
      },
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

describe('barra superior y navegación', () => {
  it('muestra las cuatro secciones, el usuario y su rol real', async () => {
    renderLayout(makeUser({ full_name: 'Sofía Escobar', role: 'supervisor' }))

    const nav = within(screen.getByRole('navigation', { name: 'Navegación principal' }))
    expect(await nav.findByRole('link', { name: 'Alertas (3 sin leer)' })).toBeInTheDocument()
    expect(nav.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Panel',
      'Solicitudes',
      'Análisis',
      'Alertas3 (3 sin leer)',
    ])
    expect(nav.getByRole('link', { name: 'Panel' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('Sofía Escobar')).toBeInTheDocument()
    expect(screen.getByText('Supervisor')).toBeInTheDocument()
  })

  it('el menú lleva a Configuración y devuelve el foco al cerrarse', async () => {
    const user = userEvent.setup()
    const router = renderLayout(makeUser())

    await user.click(screen.getByRole('button', { name: 'Menú de la cuenta' }))
    const menu = within(screen.getByRole('menu', { name: 'Menú de la cuenta' }))
    expect(screen.getByText('ana@example.com')).toBeInTheDocument()
    await user.click(menu.getByRole('menuitem', { name: 'Configuración' }))

    expect(router.state.location.pathname).toBe('/settings')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('el primer tabulador ofrece saltar al contenido', async () => {
    const user = userEvent.setup()
    renderLayout(makeUser())

    await user.tab()
    const skip = screen.getByRole('button', { name: 'Saltar al contenido' })
    expect(skip).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('no tiene infracciones de axe', async () => {
    renderLayout(makeUser())
    await screen.findByRole('link', { name: 'Alertas (3 sin leer)' })

    await expectNoA11yViolations()
  })
})
