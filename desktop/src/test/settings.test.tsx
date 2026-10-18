import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { SettingsPage } from '@/pages/SettingsPage'
import { useSessionStore } from '@/stores/session'
import { expectNoA11yViolations } from './a11y'
import { HEALTH_OK, jsonResponse, makeTokens, makeUser, mockApi } from './fixtures'
import { renderWithProviders } from './render'

vi.mock('@/lib/secureStore', () => ({
  saveRefreshToken: vi.fn(() => Promise.resolve()),
  loadRefreshToken: vi.fn(() => Promise.resolve(null)),
  clearRefreshToken: vi.fn(() => Promise.resolve()),
}))

function signIn() {
  const user = makeUser({ full_name: 'Sofía Escobar', email: 'sofia@example.com', role: 'supervisor', area: { id: 'area-1', name: 'Soporte TI' } })
  useSessionStore.getState().setSession(makeTokens(user), false)
  return user
}

describe('Configuración', () => {
  it('muestra el perfil y abre el cambio de contraseña en un diálogo', async () => {
    mockApi(() => jsonResponse(HEALTH_OK))
    signIn()
    const user = userEvent.setup()
    renderWithProviders(<SettingsPage />, { route: '/settings' })

    const profile = screen.getByRole('region', { name: 'Perfil' })
    expect(within(profile).getByRole('heading', { name: 'Sofía Escobar' })).toBeInTheDocument()
    expect(profile).toHaveTextContent('sofia@example.com · Supervisor · Soporte TI')

    await user.click(within(profile).getByRole('button', { name: 'Cambiar contraseña' }))
    const dialog = screen.getByRole('dialog', { name: 'Seguridad' })
    expect(within(dialog).getByLabelText('Contraseña actual')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('cambia el idioma desde el control segmentado', async () => {
    mockApi((request) => (request.path.startsWith('/api/v1/health') ? jsonResponse(HEALTH_OK) : jsonResponse(makeUser({ language: 'en' }))))
    signIn()
    const user = userEvent.setup()
    renderWithProviders(<SettingsPage />, { route: '/settings' })

    const language = screen.getByRole('radiogroup', { name: 'Idioma' })
    expect(within(language).getByRole('radio', { name: 'Español' })).toBeChecked()
    await user.click(within(language).getByRole('radio', { name: 'English' }))
    await vi.waitFor(() => {
      expect(i18n.language).toBe('en')
    })
  })

  it('no tiene problemas de accesibilidad', async () => {
    mockApi(() => jsonResponse(HEALTH_OK))
    signIn()
    renderWithProviders(<SettingsPage />, { route: '/settings' })

    await screen.findByText('En línea')
    await expectNoA11yViolations(document.body)
  })
})
