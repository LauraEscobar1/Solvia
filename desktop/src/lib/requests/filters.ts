import {
  REQUEST_PRIORITIES,
  REQUEST_STATUSES,
  type RequestPriority,
  type RequestStatus,
  type SlaStatus,
} from '@/lib/api/types'

export const SORT_FIELDS = [
  'code',
  'title',
  'area',
  'assignee',
  'priority',
  'status',
  'due_at',
  'last_activity_at',
  'received_at',
  'risk_score',
] as const
export type SortField = (typeof SORT_FIELDS)[number]

export const DEFAULT_SORT = '-last_activity_at'
export const DEFAULT_PAGE_SIZE = 20

export const SLA_STATUSES = ['on_track', 'at_risk', 'overdue'] as const satisfies readonly SlaStatus[]

export const OPEN_STATUSES: readonly RequestStatus[] = ['received', 'assigned', 'in_progress']
export const HIGH_RISK_FILTER = 70
const ALL_STATUSES = 'all'

export interface RequestFilters {
  status: RequestStatus[]
  priority: RequestPriority[]
  area_id?: string
  assignee_id?: string
  q?: string
  overdue?: boolean
  stalled?: boolean
  sla_status?: SlaStatus
  min_risk?: number
  received_from?: string
  received_to?: string
  completed_from?: string
  completed_to?: string
}

export interface RequestListParams extends RequestFilters {
  page: number
  size: number
  sort: string
}

const DATE_KEYS = ['received_from', 'received_to', 'completed_from', 'completed_to'] as const
const SINGLE_KEYS = ['area_id', 'assignee_id', 'q', 'sla_status', ...DATE_KEYS] as const
const FLAG_KEYS = ['overdue', 'stalled'] as const
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function includes<T extends string>(values: readonly T[], value: string): value is T {
  return (values as readonly string[]).includes(value)
}

function isValidSort(value: string): boolean {
  return includes(SORT_FIELDS, value.replace(/^-/, ''))
}

export function isOpenSelection(status: readonly RequestStatus[]): boolean {
  return status.length === OPEN_STATUSES.length && OPEN_STATUSES.every((item) => status.includes(item))
}

function statusesFromSearch(search: URLSearchParams): RequestStatus[] {
  const values = search.getAll('status')
  if (values.includes(ALL_STATUSES)) return []
  if (values.length === 0) return [...OPEN_STATUSES]
  return values.filter((value) => includes(REQUEST_STATUSES, value))
}

function minRiskFrom(search: URLSearchParams): number | undefined {
  const value = Number(search.get('min_risk'))
  return search.has('min_risk') && Number.isInteger(value) && value >= 0 && value <= 100 ? value : undefined
}

export function filtersFromSearch(search: URLSearchParams): RequestListParams {
  const page = Number(search.get('page'))
  const sort = search.get('sort') ?? DEFAULT_SORT
  const params: RequestListParams = {
    status: statusesFromSearch(search),
    priority: search.getAll('priority').filter((value) => includes(REQUEST_PRIORITIES, value)),
    page: Number.isInteger(page) && page > 0 ? page : 1,
    size: DEFAULT_PAGE_SIZE,
    sort: isValidSort(sort) ? sort : DEFAULT_SORT,
  }
  for (const key of SINGLE_KEYS) {
    const value = search.get(key)?.trim()
    if (!value) continue
    if (includes(DATE_KEYS, key) && !DATE_PATTERN.test(value)) continue
    if (key === 'sla_status') {
      if (includes(SLA_STATUSES, value)) params.sla_status = value
      continue
    }
    params[key] = value
  }
  for (const key of FLAG_KEYS) {
    if (search.get(key) === 'true') params[key] = true
  }
  const minRisk = minRiskFrom(search)
  if (minRisk !== undefined) params.min_risk = minRisk
  return params
}

function appendFilters(search: URLSearchParams, filters: Partial<RequestFilters>, target: 'url' | 'api'): void {
  const status = filters.status
  if (target === 'api') {
    for (const item of status ?? []) search.append('status', item)
  } else if (status !== undefined && !isOpenSelection(status)) {
    if (status.length === 0) search.append('status', ALL_STATUSES)
    for (const item of status) search.append('status', item)
  }
  for (const priority of filters.priority ?? []) search.append('priority', priority)
  for (const key of SINGLE_KEYS) {
    const value = filters[key]
    if (value) search.set(key, value)
  }
  for (const key of FLAG_KEYS) {
    if (filters[key]) search.set(key, 'true')
  }
  if (filters.min_risk !== undefined) search.set('min_risk', String(filters.min_risk))
}

export function requestsPath(filters: Partial<RequestFilters> & { sort?: string }): string {
  const search = new URLSearchParams()
  appendFilters(search, filters, 'url')
  if (filters.sort) search.set('sort', filters.sort)
  const query = search.toString()
  return query ? `/requests?${query}` : '/requests'
}

export function searchFromFilters(params: RequestListParams): URLSearchParams {
  const search = new URLSearchParams()
  appendFilters(search, params, 'url')
  if (params.sort !== DEFAULT_SORT) search.set('sort', params.sort)
  if (params.page > 1) search.set('page', String(params.page))
  return search
}

export function apiQuery(params: RequestFilters & Partial<Pick<RequestListParams, 'page' | 'size' | 'sort'>>): string {
  const search = new URLSearchParams()
  appendFilters(search, params, 'api')
  if (params.page) search.set('page', String(params.page))
  if (params.size) search.set('size', String(params.size))
  if (params.sort) search.set('sort', params.sort)
  return search.toString()
}

export function activeFilterCount(filters: RequestFilters): number {
  return [
    !isOpenSelection(filters.status),
    filters.priority.length > 0,
    filters.min_risk !== undefined,
    ...SINGLE_KEYS.map((key) => Boolean(filters[key])),
    ...FLAG_KEYS.map((key) => Boolean(filters[key])),
  ].filter(Boolean).length
}

export function hasActiveFilters(filters: RequestFilters): boolean {
  return activeFilterCount(filters) > 0
}

export function defaultFilters(): RequestFilters {
  return { status: [...OPEN_STATUSES], priority: [] }
}

const BOARD_ORDER: readonly RequestStatus[] = ['received', 'assigned', 'in_progress', 'completed', 'cancelled']

export function boardStatuses(status: readonly RequestStatus[]): RequestStatus[] {
  if (status.length === 0) return [...BOARD_ORDER]
  if (isOpenSelection(status)) return [...OPEN_STATUSES, 'completed']
  return BOARD_ORDER.filter((item) => status.includes(item))
}

export function boardFilters(params: RequestListParams): RequestFilters {
  const filters: RequestFilters = { status: boardStatuses(params.status), priority: params.priority }
  for (const key of SINGLE_KEYS) {
    const value = params[key]
    if (value) Object.assign(filters, { [key]: value })
  }
  for (const key of FLAG_KEYS) {
    if (params[key]) filters[key] = true
  }
  if (params.min_risk !== undefined) filters.min_risk = params.min_risk
  return filters
}
