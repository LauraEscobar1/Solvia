import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CreateRequestDialog } from '@/pages/requests/CreateRequestDialog'
import { useSessionStore } from '@/stores/session'
import { expectNoA11yViolations } from './a11y'
import { EMPTY_PAGE, jsonResponse, makeRequest, makeTokens, makeUser, mockApi } from './fixtures'
import { renderWithProviders } from './render'

vi.mock('@/lib/secureStore', () => ({
  saveRefreshToken: vi.fn(() => Promise.resolve()),
  loadRefreshToken: vi.fn(() => Promise.resolve(null)),
  clearRefreshToken: vi.fn(() => Promise.resolve()),
}))

const SUPPORT = { id: 'area-1', name: 'Soporte TI', is_active: true }

function mockCreate() {
  return mockApi((request) => {
    if (request.path.startsWith('/api/v1/requests/due-estimates')) {
      return jsonResponse([
        { priority: 'medium', hours: 48 },
        { priority: 'low', hours: null },
      ])
    }
    if (request.path.startsWith('/api/v1/areas')) return jsonResponse({ ...EMPTY_PAGE, items: [SUPPORT] })
    if (request.method === 'POST' && request.path === '/api/v1/requests') {
      return jsonResponse({ ...makeRequest({ id: 'req-new', code: 'SOL-0200' }), description: 'x' }, 201)
    }
    return jsonResponse(EMPTY_PAGE)
  })
}

describe('Nueva solicitud', () => {
  it('valida, muestra el vencimiento estimado y crea la solicitud', async () => {
    const requests = mockCreate()
    useSessionStore.getState().setSession(makeTokens(makeUser({ role: 'requester', area: null })), false)
    const onCreated = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<CreateRequestDialog onClose={vi.fn()} onCreated={onCreated} />)

    const dialog = screen.getByRole('dialog', { name: 'Nueva solicitud' })
    expect(await within(dialog).findByRole('status')).toHaveTextContent('48 h según la política SLA de esta prioridad.')

    await user.click(within(dialog).getByRole('button', { name: 'Crear solicitud' }))
    expect(within(dialog).getAllByRole('alert')).toHaveLength(3)

    await user.selectOptions(within(dialog).getByLabelText('Prioridad'), 'low')
    expect(within(dialog).getByText('No hay política SLA para esta prioridad: la solicitud no tendrá fecha límite.')).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText('Título'), 'Proyector del aula 3')
    await user.type(within(dialog).getByLabelText('Descripción'), 'No enciende desde ayer.')
    await within(dialog).findByRole('option', { name: 'Soporte TI' })
    await user.selectOptions(within(dialog).getByLabelText('Área'), 'area-1')
    await user.click(within(dialog).getByRole('button', { name: 'Crear solicitud' }))

    await vi.waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1)
    })
    expect(requests.find((request) => request.method === 'POST')?.body).toEqual({
      title: 'Proyector del aula 3',
      description: 'No enciende desde ayer.',
      area_id: 'area-1',
      priority: 'low',
    })
  })

  it('no tiene problemas de accesibilidad', async () => {
    mockCreate()
    useSessionStore.getState().setSession(makeTokens(makeUser()), false)
    renderWithProviders(<CreateRequestDialog onClose={vi.fn()} onCreated={vi.fn()} />)

    await screen.findByRole('status')
    await expectNoA11yViolations(document.body)
  })
})
