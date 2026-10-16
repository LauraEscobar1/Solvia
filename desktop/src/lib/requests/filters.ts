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
] as const
export type SortField = (typeof SORT_FIELDS)[number]

export const DEFAULT_SORT = '-last_activity_at'
export const DEFAULT_PAGE_SIZE = 20

export const SLA_STATUSES = ['on_track', 'at_risk', 'overdue'] as const satisfies readonly SlaStatus[]

export interface RequestFilters {
  status: RequestStatus[]
  priority: RequestPriority[]
  area_id?: string
  assignee_id?: string
  q?: string
  overdue?: boolean
  stalled?: boolean
  sla_status?: SlaStatus
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

export function filtersFromSearch(search: URLSearchParams): RequestListParams {
  const page = Number(search.get('page'))
  const sort = search.get('sort') ?? DEFAULT_SORT
  const params: RequestListParams = {
    status: search.getAll('status').filter((value) => includes(REQUEST_STATUSES, value)),
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
  return params
}

function appendFilters(search: URLSearchParams, filters: RequestFilters): void {
  for (const status of filters.status) search.append('status', status)
  for (const priority of filters.priority) search.append('priority', priority)
  for (const key of SINGLE_KEYS) {
    const value = filters[key]
    if (value) search.set(key, value)
  }
  for (const key of FLAG_KEYS) {
    if (filters[key]) search.set(key, 'true')
  }
}

export function requestsPath(filters: Partial<RequestFilters>): string {
  const search = new URLSearchParams()
  appendFilters(search, { status: [], priority: [], ...filters })
  const query = search.toString()
  return query ? `/requests?${query}` : '/requests'
}

export function searchFromFilters(params: RequestListParams): URLSearchParams {
  const search = new URLSearchParams()
  appendFilters(search, params)
  if (params.sort !== DEFAULT_SORT) search.set('sort', params.sort)
  if (params.page > 1) search.set('page', String(params.page))
  return search
}

export function apiQuery(params: RequestFilters & Partial<Pick<RequestListParams, 'page' | 'size' | 'sort'>>): string {
  const search = new URLSearchParams()
  appendFilters(search, params)
  if (params.page) search.set('page', String(params.page))
  if (params.size) search.set('size', String(params.size))
  if (params.sort) search.set('sort', params.sort)
  return search.toString()
}

export function hasActiveFilters(filters: RequestFilters): boolean {
  return (
    filters.status.length > 0 ||
    filters.priority.length > 0 ||
    SINGLE_KEYS.some((key) => Boolean(filters[key])) ||
    FLAG_KEYS.some((key) => Boolean(filters[key]))
  )
}

export function boardFilters(params: RequestListParams): RequestFilters {
  const filters: RequestFilters = { status: params.status, priority: params.priority }
  for (const key of SINGLE_KEYS) {
    const value = params[key]
    if (value) Object.assign(filters, { [key]: value })
  }
  for (const key of FLAG_KEYS) {
    if (params[key]) filters[key] = true
  }
  return filters
}
