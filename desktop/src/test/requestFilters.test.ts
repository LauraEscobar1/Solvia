import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from '@/lib/format'
import {
  activeFilterCount,
  apiQuery,
  boardFilters,
  boardStatuses,
  DEFAULT_SORT,
  filtersFromSearch,
  hasActiveFilters,
  OPEN_STATUSES,
  requestsPath,
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

describe('etapa por defecto, todas y riesgo', () => {
  it('sin etapa en la URL usa las abiertas y «all» significa todas', () => {
    expect(filtersFromSearch(new URLSearchParams()).status).toEqual(OPEN_STATUSES)
    const all = filtersFromSearch(new URLSearchParams('status=all'))

    expect(all.status).toEqual([])
    expect(searchFromFilters(all).toString()).toBe('status=all')
    expect(apiQuery(all)).not.toContain('status=')
    expect(activeFilterCount(all)).toBe(1)
  })

  it('lee y escribe min_risk e ignora valores fuera de rango', () => {
    const risky = filtersFromSearch(new URLSearchParams('min_risk=70'))

    expect(risky.min_risk).toBe(70)
    expect(searchFromFilters(risky).toString()).toBe('min_risk=70')
    expect(apiQuery(boardFilters(risky))).toContain('min_risk=70')
    expect(filtersFromSearch(new URLSearchParams('min_risk=150')).min_risk).toBeUndefined()
    expect(filtersFromSearch(new URLSearchParams('min_risk=alto')).min_risk).toBeUndefined()
  })

  it('el tablero agrega completadas a las abiertas y respeta una selección propia', () => {
    expect(boardStatuses([...OPEN_STATUSES])).toEqual(['received', 'assigned', 'in_progress', 'completed'])
    expect(boardStatuses([])).toEqual(['received', 'assigned', 'in_progress', 'completed', 'cancelled'])
    expect(boardStatuses(['cancelled', 'received'])).toEqual(['received', 'cancelled'])
  })
})

describe('filtros SLA y de completadas', () => {
  it('lee y escribe sla_status, stalled y el rango de completadas', () => {
    const params = filtersFromSearch(
      new URLSearchParams(
        'sla_status=at_risk&stalled=true&completed_from=2026-10-09&completed_to=2026-10-15',
      ),
    )

    expect(params).toMatchObject({
      sla_status: 'at_risk',
      stalled: true,
      completed_from: '2026-10-09',
      completed_to: '2026-10-15',
    })
    expect(hasActiveFilters(params)).toBe(true)
    expect(searchFromFilters(params).toString()).toBe(
      'sla_status=at_risk&completed_from=2026-10-09&completed_to=2026-10-15&stalled=true',
    )
    expect(apiQuery(boardFilters(params))).toContain('stalled=true')
  })

  it('descarta un sla_status desconocido y fechas mal formadas', () => {
    const params = filtersFromSearch(
      new URLSearchParams('sla_status=perdida&completed_from=ayer&stalled=quizas'),
    )

    expect(params.sla_status).toBeUndefined()
    expect(params.completed_from).toBeUndefined()
    expect(params.stalled).toBeUndefined()
    expect(hasActiveFilters(params)).toBe(false)
  })

  it('construye la ruta de la lista para los enlaces del panel', () => {
    expect(requestsPath({})).toBe('/requests')
    expect(requestsPath({ area_id: 'a-1', status: ['received'] })).toBe(
      '/requests?status=received&area_id=a-1',
    )
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
