import { describe, expect, it } from 'vitest'
import { formatDateTime, formatNumber } from '@/lib/format'
import { normalizeApiBaseUrl } from '@/stores/settings'

describe('formato con Intl', () => {
  it('formatea números según el idioma', () => {
    expect(formatNumber(1234567.891, 'es-ES')).toBe('1.234.567,891')
    expect(formatNumber(1234567.891, 'en-US')).toBe('1,234,567.891')
  })

  it('formatea fechas según el idioma', () => {
    const date = '2026-10-15T09:30:00Z'
    const options = { dateStyle: 'long', timeZone: 'UTC' } as const

    expect(formatDateTime(date, 'es', options)).toBe('15 de octubre de 2026')
    expect(formatDateTime(date, 'en', options)).toBe('October 15, 2026')
  })
})

describe('URL base de la API', () => {
  it.each([
    ['http://localhost:8000', 'http://localhost:8000'],
    ['  https://api.solvia.local/  ', 'https://api.solvia.local'],
    ['http://10.0.0.5:8000/base/?x=1#h', 'http://10.0.0.5:8000/base'],
  ])('normaliza %j', (input, expected) => {
    expect(normalizeApiBaseUrl(input)).toBe(expected)
  })

  it.each(['', 'localhost:8000', 'ftp://servidor', 'no es una url'])('rechaza %j', (input) => {
    expect(normalizeApiBaseUrl(input)).toBeNull()
  })
})
