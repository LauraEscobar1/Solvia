import { useQuery } from '@tanstack/react-query'
import { useSettingsStore } from '@/stores/settings'
import { apiRequest } from './client'

export interface HealthResponse {
  status: 'ok' | 'degraded'
  version: string
  environment: 'development' | 'test' | 'production'
  database: { status: 'ok' | 'unavailable' }
  ai: { provider: 'none' | 'deepseek'; model: string | null; configured: boolean }
  organization?: { name: string | null }
}

export const HEALTH_PATH = '/api/v1/health'
const REFRESH_INTERVAL_MS = 30_000

export function useHealth() {
  const baseUrl = useSettingsStore((state) => state.apiBaseUrl)
  return useQuery({
    queryKey: ['health', baseUrl],
    queryFn: ({ signal }) => apiRequest<HealthResponse>(HEALTH_PATH, { baseUrl, signal }),
    refetchInterval: REFRESH_INTERVAL_MS,
  })
}
