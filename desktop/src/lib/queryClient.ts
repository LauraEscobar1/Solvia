import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api/client'

const MAX_RETRIES = 2

function isClientError(error: unknown): boolean {
  return error instanceof ApiError && error.status !== null && error.status < 500
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => !isClientError(error) && failureCount < MAX_RETRIES,
        refetchOnWindowFocus: false,
        staleTime: 10_000,
      },
    },
  })
}
