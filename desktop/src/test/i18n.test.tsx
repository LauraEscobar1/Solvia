import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TopBar } from '@/components/layout/TopBar'
import { LanguageSelector } from '@/components/LanguageSelector'
import i18n, { i18nOptions, LANGUAGE_STORAGE_KEY } from '@/i18n'
import { ApiError } from '@/lib/api/client'
import { translateError } from '@/lib/api/errors'
import { renderWithProviders } from './render'

describe('cambio de idioma', () => {
  it('traduce la interfaz, actualiza <html lang> y recuerda la elección', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <>
        <TopBar />
        <LanguageSelector />
      </>,
      { route: '/requests' },
    )

    expect(screen.getByRole('link', { name: 'Solicitudes' })).toHaveAttribute('aria-current', 'page')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Idioma' }), 'en')

    expect(await screen.findByRole('link', { name: 'Requests' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Insights' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en')
  })
})

describe('detección del idioma inicial', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function detectWith(systemLanguages: string[]): Promise<string | undefined> {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(systemLanguages)
    vi.spyOn(navigator, 'language', 'get').mockReturnValue(systemLanguages[0] ?? '')
    const instance = i18next.createInstance().use(LanguageDetector)
    await instance.init(i18nOptions)
    return instance.resolvedLanguage
  }

  it.each([
    [['es-MX', 'en-US'], 'es'],
    [['en-GB'], 'en'],
    [['fr-FR'], 'es'],
  ])('sistema %j → %s', async (systemLanguages, expected) => {
    expect(await detectWith(systemLanguages)).toBe(expected)
  })

  it('la elección guardada tiene prioridad sobre el sistema', async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en')
    expect(await detectWith(['es-ES'])).toBe('en')
  })
})

describe('traducción de códigos de error del backend', () => {
  it('traduce códigos conocidos en el idioma activo', async () => {
    const error = new ApiError('request.not_found', {}, 404)

    expect(translateError(i18n, error)).toBe('La solicitud no existe.')
    await i18n.changeLanguage('en')
    expect(translateError(i18n, error)).toBe('The request does not exist.')
  })

  it('interpola los parámetros del error', () => {
    const error = new ApiError('common.http_error', { status: 418 }, 418)

    expect(translateError(i18n, error)).toBe(
      'Error de comunicación con el servidor (HTTP 418).',
    )
  })

  it('usa un mensaje genérico para códigos desconocidos u otros errores', () => {
    expect(translateError(i18n, new ApiError('nuevo.codigo'))).toBe(
      'Ha ocurrido un error inesperado.',
    )
    expect(translateError(i18n, new Error('boom'))).toBe('Ha ocurrido un error inesperado.')
  })
})
