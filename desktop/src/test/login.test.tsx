import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { saveRefreshToken } from '@/lib/secureStore'
import { LoginPage } from '@/pages/LoginPage'
import { useSessionStore } from '@/stores/session'
import { useThemeStore } from '@/stores/theme'
import { expectNoA11yViolations } from './a11y'
import {
  errorResponse,
  HEALTH_OK,
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

function renderLogin() {
  const router = createMemoryRouter(
    [
      { path: '/login', Component: LoginPage },
      { path: '/', element: <p>inicio</p> },
    ],
    { initialEntries: ['/login'] },
  )
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

function withHealth(handler: (request: RecordedRequest) => Response, organization: string | null = null) {
  return mockApi((request) =>
    request.path === '/api/v1/health'
      ? jsonResponse({ ...HEALTH_OK, organization: { name: organization } })
      : handler(request),
  )
}

function apiCalls(requests: RecordedRequest[]): RecordedRequest[] {
  return requests.filter((request) => request.path !== '/api/v1/health')
}

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Correo institucional'), email)
  await user.type(screen.getByLabelText('Contraseña'), password)
  await user.click(screen.getByRole('button', { name: 'Ingresar' }))
  return user
}

describe('formulario de login', () => {
  beforeEach(() => {
    vi.mocked(saveRefreshToken).mockClear()
  })

  it('valida los campos y muestra errores traducidos sin llamar a la API', async () => {
    const requests = withHealth(() => jsonResponse({}))
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(await screen.findAllByText('Este campo es obligatorio.')).toHaveLength(2)

    await user.type(screen.getByLabelText('Correo institucional'), 'no-es-un-email')
    await user.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(await screen.findByText('Introduce un email válido.')).toBeInTheDocument()
    expect(apiCalls(requests)).toHaveLength(0)
  })

  it('inicia sesión, recuerda el token en el llavero y aplica las preferencias del perfil', async () => {
    const profile = makeUser({ language: 'en', theme: 'dark' })
    const requests = withHealth(() => jsonResponse(makeTokens(profile)))
    renderLogin()

    await fillAndSubmit('ana@example.com', 'contrasena-segura')

    expect(await screen.findByText('inicio')).toBeInTheDocument()
    expect(apiCalls(requests)[0]).toMatchObject({
      method: 'POST',
      path: '/api/v1/auth/login',
      body: { email: 'ana@example.com', password: 'contrasena-segura' },
    })
    const session = useSessionStore.getState()
    expect(session.status).toBe('authenticated')
    expect(session.accessToken).toBe('access-1')
    expect(saveRefreshToken).toHaveBeenCalledWith('refresh-1')
    expect(useThemeStore.getState().preference).toBe('dark')
    expect(i18n.language).toBe('en')
  })

  it('sin "recordarme" no guarda el token en el llavero', async () => {
    withHealth(() => jsonResponse(makeTokens(makeUser())))
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByLabelText('Mantener la sesión iniciada'))
    await fillAndSubmit('ana@example.com', 'contrasena-segura')

    expect(await screen.findByText('inicio')).toBeInTheDocument()
    expect(useSessionStore.getState().remember).toBe(false)
    expect(saveRefreshToken).not.toHaveBeenCalled()
  })

  it('muestra el error del backend traducido', async () => {
    withHealth(() => errorResponse('auth.invalid_credentials', 401))
    renderLogin()

    await fillAndSubmit('ana@example.com', 'incorrecta')

    expect(await screen.findByRole('alert')).toHaveTextContent('Email o contraseña incorrectos.')
    expect(useSessionStore.getState().status).toBe('anonymous')
  })

  it('muestra el nombre de la organización y la ayuda para recuperar la contraseña', async () => {
    withHealth(() => jsonResponse({}), 'Universidad del Norte')
    const user = userEvent.setup()
    renderLogin()

    expect(await screen.findByText('Universidad del Norte')).toBeInTheDocument()
    const forgot = screen.getByRole('button', { name: '¿La olvidaste?' })
    expect(forgot).toHaveAttribute('aria-expanded', 'false')
    await user.click(forgot)
    expect(forgot).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Pídele a un administrador de Solvia')
    await user.click(screen.getByRole('button', { name: 'Mostrar contraseña' }))
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('type', 'text')
  })

  it('sin nombre de organización no muestra nada en su lugar y no tiene infracciones de axe', async () => {
    const requests = withHealth(() => jsonResponse({}))
    renderLogin()

    await vi.waitFor(() => {
      expect(requests.some((request) => request.path === '/api/v1/health')).toBe(true)
    })
    expect(screen.getByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(screen.queryByText('Universidad del Norte')).toBeNull()
    await expectNoA11yViolations()
  })
})
