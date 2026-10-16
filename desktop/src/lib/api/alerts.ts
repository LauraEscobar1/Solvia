import {
  keepPreviousData,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { apiRequest } from './client'
import type { Alert, AlertListParams, Page } from './types'

export const ALERTS_REFRESH_MS = 60_000
export const CRITICAL_WATCH_SIZE = 50

export const alertKeys = {
  all: ['alerts'] as const,
  lists: () => [...alertKeys.all, 'list'] as const,
  list: (params: AlertListParams) => [...alertKeys.lists(), params] as const,
  unread: () => [...alertKeys.all, 'unread-count'] as const,
  critical: () => [...alertKeys.all, 'critical'] as const,
}

export function alertsQuery(params: AlertListParams): string {
  const search = new URLSearchParams()
  for (const type of params.type) search.append('type', type)
  for (const severity of params.severity) search.append('severity', severity)
  if (params.state) search.set('state', params.state)
  if (params.is_read !== undefined) search.set('is_read', String(params.is_read))
  search.set('page', String(params.page))
  search.set('size', String(params.size))
  return search.toString()
}

export function invalidateAlerts(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: alertKeys.all })
}

export function useAlerts(params: AlertListParams) {
  return useQuery({
    queryKey: alertKeys.list(params),
    queryFn: ({ signal }) =>
      apiRequest<Page<Alert>>(`/api/v1/alerts?${alertsQuery(params)}`, { signal }),
    placeholderData: keepPreviousData,
    refetchInterval: ALERTS_REFRESH_MS,
  })
}

export function useUnreadAlertCount() {
  return useQuery({
    queryKey: alertKeys.unread(),
    queryFn: ({ signal }) => apiRequest<{ count: number }>('/api/v1/alerts/unread-count', { signal }),
    select: (data) => data.count,
    refetchInterval: ALERTS_REFRESH_MS,
  })
}

export function useCriticalAlerts(enabled: boolean) {
  return useQuery({
    queryKey: alertKeys.critical(),
    queryFn: ({ signal }) =>
      apiRequest<Page<Alert>>(
        `/api/v1/alerts?${alertsQuery({
          page: 1,
          size: CRITICAL_WATCH_SIZE,
          type: [],
          severity: ['critical'],
          state: 'open',
          is_read: false,
        })}`,
        { signal },
      ),
    select: (page) => page.items,
    enabled,
    refetchInterval: ALERTS_REFRESH_MS,
  })
}

export function useMarkAlertRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiRequest<Alert>(`/api/v1/alerts/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => invalidateAlerts(queryClient),
  })
}

export function useMarkAllAlertsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiRequest<{ count: number }>('/api/v1/alerts/read-all', { method: 'POST' }),
    onSuccess: () => invalidateAlerts(queryClient),
  })
}
