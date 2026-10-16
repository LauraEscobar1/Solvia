import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from './client'
import type { AIStatus, OverviewAnalysis, RequestAnalysis, UILanguage } from './types'

export const aiKeys = {
  all: ['ai'] as const,
  request: (id: string, language: UILanguage) => [...aiKeys.all, 'request', id, language] as const,
  overview: (areaId: string | undefined, language: UILanguage) =>
    [...aiKeys.all, 'overview', areaId ?? 'global', language] as const,
  status: () => [...aiKeys.all, 'status'] as const,
}

function search(values: Record<string, string | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value)
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function useRequestInsight(id: string, language: UILanguage) {
  return useQuery({
    queryKey: aiKeys.request(id, language),
    queryFn: ({ signal }) =>
      apiRequest<RequestAnalysis>(`/api/v1/ai/requests/${id}/insight${search({ language })}`, {
        signal,
      }),
  })
}

export function useAnalyzeRequest(id: string, language: UILanguage) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiRequest<RequestAnalysis>(`/api/v1/ai/requests/${id}/analyze${search({ language })}`, {
        method: 'POST',
        timeoutMs: 60_000,
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(aiKeys.request(id, language), result)
    },
  })
}

export function useOverview(areaId: string | undefined, language: UILanguage, enabled: boolean) {
  return useQuery({
    queryKey: aiKeys.overview(areaId, language),
    queryFn: ({ signal }) =>
      apiRequest<OverviewAnalysis>(
        `/api/v1/ai/overview${search({ area_id: areaId, language })}`,
        { signal },
      ),
    enabled,
  })
}

export function useAnalyzeOverview(areaId: string | undefined, language: UILanguage) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiRequest<OverviewAnalysis>(
        `/api/v1/ai/overview/analyze${search({ area_id: areaId, language })}`,
        { method: 'POST', timeoutMs: 180_000 },
      ),
    onSuccess: (result) => {
      queryClient.setQueryData(aiKeys.overview(areaId, language), result)
    },
  })
}

export function useAIStatus() {
  return useQuery({
    queryKey: aiKeys.status(),
    queryFn: ({ signal }) => apiRequest<AIStatus>('/api/v1/ai/status', { signal }),
    refetchInterval: 60_000,
  })
}

export function useInsightFeedback() {
  return useMutation({
    mutationFn: ({ insightId, item, useful }: { insightId: string; item: number; useful: boolean }) =>
      apiRequest<null>(`/api/v1/ai/insights/${insightId}/feedback`, {
        method: 'POST',
        body: { item, useful },
      }),
  })
}
