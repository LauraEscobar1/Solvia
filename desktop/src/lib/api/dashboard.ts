import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiRequest } from './client'
import type {
  BottleneckMatrix,
  DashboardQuery,
  DashboardSummary,
  RequestHighlights,
  StatusBreakdown,
  TrendSeries,
} from './types'

export const DASHBOARD_REFRESH_MS = 60_000

type DashboardResource = 'summary' | 'by-status' | 'at-risk' | 'stalled' | 'bottlenecks' | 'trends'

export const dashboardKeys = {
  all: ['dashboard'] as const,
  resource: (resource: DashboardResource, query: DashboardQuery) =>
    [...dashboardKeys.all, resource, query] as const,
}

export function dashboardSearch(query: DashboardQuery): string {
  const search = new URLSearchParams()
  if (query.area_id) search.set('area_id', query.area_id)
  if (query.date_from) search.set('date_from', query.date_from)
  if (query.date_to) search.set('date_to', query.date_to)
  return search.toString()
}

function useDashboardResource<T>(resource: DashboardResource, query: DashboardQuery) {
  return useQuery({
    queryKey: dashboardKeys.resource(resource, query),
    queryFn: ({ signal }) => {
      const search = dashboardSearch(query)
      const path = `/api/v1/dashboard/${resource}${search ? `?${search}` : ''}`
      return apiRequest<T>(path, { signal })
    },
    placeholderData: keepPreviousData,
    refetchInterval: DASHBOARD_REFRESH_MS,
  })
}

export function useDashboardSummary(query: DashboardQuery) {
  return useDashboardResource<DashboardSummary>('summary', query)
}

export function useStatusBreakdown(query: DashboardQuery) {
  return useDashboardResource<StatusBreakdown>('by-status', query)
}

export function useAtRiskRequests(query: DashboardQuery) {
  return useDashboardResource<RequestHighlights>('at-risk', query)
}

export function useStalledRequests(query: DashboardQuery) {
  return useDashboardResource<RequestHighlights>('stalled', query)
}

export function useBottlenecks(query: DashboardQuery) {
  return useDashboardResource<BottleneckMatrix>('bottlenecks', query)
}

export function useTrends(query: DashboardQuery) {
  return useDashboardResource<TrendSeries>('trends', query)
}
