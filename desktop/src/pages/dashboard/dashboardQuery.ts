import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import type { DashboardQuery } from '@/lib/api/types'

const QUERY_KEYS = ['area_id', 'date_from', 'date_to'] as const
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function useDashboardQuery(): [DashboardQuery, (changes: Partial<DashboardQuery>) => void] {
  const [search, setSearch] = useSearchParams()
  const query = useMemo(() => {
    const result: DashboardQuery = {}
    for (const key of QUERY_KEYS) {
      const value = search.get(key)?.trim()
      if (!value) continue
      if (key !== 'area_id' && !DATE_PATTERN.test(value)) continue
      result[key] = value
    }
    return result
  }, [search])

  const update = useCallback(
    (changes: Partial<DashboardQuery>) => {
      setSearch(
        (current) => {
          const next = new URLSearchParams(current)
          for (const key of QUERY_KEYS) {
            if (!(key in changes)) continue
            const value = changes[key]
            if (value) next.set(key, value)
            else next.delete(key)
          }
          return next
        },
        { replace: true },
      )
    },
    [setSearch],
  )

  return [query, update]
}
