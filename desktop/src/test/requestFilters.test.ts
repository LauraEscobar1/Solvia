import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from '@/lib/format'
import {
  apiQuery,
  DEFAULT_SORT,
  filtersFromSearch,
  hasActiveFilters,
  searchFromFilters,
} from '@/lib/requests/filters'

describe('filtros de solicitudes en la URL', () => {
  it('ignora valores inválidos y aplica los valores por defecto', () => {
    const params = filtersFromSearch(
      new URLSearchParams(
        'status=received&status=borrado&priority=urgente&page=-3&sort=hack&received_from=ayer',
      ),
    )

    expect(params).toEqual({
      status: ['received'],
      priority: [],
      page: 1,
      size: 20,
      sort: DEFAULT_SORT,
    })
    expect(hasActiveFilters(params)).toBe(true)
  })

  it('ida y vuelta entre la URL y los filtros', () => {
    const search = new URLSearchParams(
      'status=assigned&status=in_progress&priority=high&q=vpn&overdue=true&sort=-due_at&page=2',
    )
    const params = filtersFromSearch(search)

    expect(searchFromFilters(params).toString()).toBe(search.toString())
    expect(apiQuery(params)).toBe(
      'status=assigned&status=in_progress&priority=high&q=vpn&overdue=true&page=2&size=20&sort=-due_at',
    )
  })

  it('omite los valores por defecto al escribir la URL', () => {
    const params = filtersFromSearch(new URLSearchParams())

    expect(searchFromFilters(params).toString()).toBe('')
    expect(hasActiveFilters(params)).toBe(false)
  })
})

describe('fechas relativas', () => {
  const now = new Date('2026-10-15T12:00:00Z')

  it.each([
    ['2026-10-15T09:00:00Z', 'es', 'hace 3 horas'],
    ['2026-10-14T12:00:00Z', 'es', 'ayer'],
    ['2026-10-15T11:59:30Z', 'en', '30 seconds ago'],
    ['2026-10-18T12:00:00Z', 'en', 'in 3 days'],
  ])('%s en %s → %s', (value, locale, expected) => {
    expect(formatRelativeTime(value, locale, now)).toBe(expected)
  })
})
