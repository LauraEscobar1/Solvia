import {
  REQUEST_PRIORITIES,
  REQUEST_STATUSES,
  type RequestPriority,
  type RequestStatus,
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

export interface RequestFilters {
  status: RequestStatus[]
  priority: RequestPriority[]
  area_id?: string
  assignee_id?: string
  q?: string
  overdue?: boolean
  received_from?: string
  received_to?: string
}

export interface RequestListParams extends RequestFilters {
  page: number
  size: number
  sort: string
}

const SINGLE_KEYS = ['area_id', 'assignee_id', 'q', 'received_from', 'received_to'] as const
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
    if ((key === 'received_from' || key === 'received_to') && !DATE_PATTERN.test(value)) continue
    params[key] = value
  }
  if (search.get('overdue') === 'true') params.overdue = true
  return params
}

export function searchFromFilters(params: RequestListParams): URLSearchParams {
  const search = new URLSearchParams()
  for (const status of params.status) search.append('status', status)
  for (const priority of params.priority) search.append('priority', priority)
  for (const key of SINGLE_KEYS) {
    const value = params[key]
    if (value) search.set(key, value)
  }
  if (params.overdue) search.set('overdue', 'true')
  if (params.sort !== DEFAULT_SORT) search.set('sort', params.sort)
  if (params.page > 1) search.set('page', String(params.page))
  return search
}

export function apiQuery(params: RequestFilters & Partial<Pick<RequestListParams, 'page' | 'size' | 'sort'>>): string {
  const search = new URLSearchParams()
  for (const status of params.status) search.append('status', status)
  for (const priority of params.priority) search.append('priority', priority)
  for (const key of SINGLE_KEYS) {
    const value = params[key]
    if (value) search.set(key, value)
  }
  if (params.overdue) search.set('overdue', 'true')
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
    Boolean(filters.overdue)
  )
}

export function boardFilters(params: RequestListParams): RequestFilters {
  const { status, priority, area_id, assignee_id, q, overdue, received_from, received_to } = params
  return { status, priority, area_id, assignee_id, q, overdue, received_from, received_to }
}
