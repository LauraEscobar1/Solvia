import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { saveRefreshToken } from '@/lib/secureStore'
import { LoginPage } from '@/pages/LoginPage'
import { useSessionStore } from '@/stores/session'
import { useThemeStore } from '@/stores/theme'
import { errorResponse, jsonResponse, makeTokens, makeUser, mockApi } from './fixtures'

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
  render(<RouterProvider router={router} />)
}

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Contraseña'), password)
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
  return user
}

describe('formulario de login', () => {
  beforeEach(() => {
    vi.mocked(saveRefreshToken).mockClear()
  })

  it('valida los campos y muestra errores traducidos sin llamar a la API', async () => {
    const requests = mockApi(() => jsonResponse({}))
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findAllByText('Este campo es obligatorio.')).toHaveLength(2)

    await user.type(screen.getByLabelText('Email'), 'no-es-un-email')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('Introduce un email válido.')).toBeInTheDocument()
    expect(requests).toHaveLength(0)
  })

  it('inicia sesión, recuerda el token en el llavero y aplica las preferencias del perfil', async () => {
    const profile = makeUser({ language: 'en', theme: 'dark' })
    const requests = mockApi(() => jsonResponse(makeTokens(profile)))
    renderLogin()

    await fillAndSubmit('ana@example.com', 'contrasena-segura')

    expect(await screen.findByText('inicio')).toBeInTheDocument()
    expect(requests[0]).toMatchObject({
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
    mockApi(() => jsonResponse(makeTokens(makeUser())))
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByLabelText('Recordarme en este equipo'))
    await fillAndSubmit('ana@example.com', 'contrasena-segura')

    expect(await screen.findByText('inicio')).toBeInTheDocument()
    expect(useSessionStore.getState().remember).toBe(false)
    expect(saveRefreshToken).not.toHaveBeenCalled()
  })

  it('muestra el error del backend traducido', async () => {
    mockApi(() => errorResponse('auth.invalid_credentials', 401))
    renderLogin()

    await fillAndSubmit('ana@example.com', 'incorrecta')

    expect(await screen.findByRole('alert')).toHaveTextContent('Email o contraseña incorrectos.')
    expect(useSessionStore.getState().status).toBe('anonymous')
  })
})
