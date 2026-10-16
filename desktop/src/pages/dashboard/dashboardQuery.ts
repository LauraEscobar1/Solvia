import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import type { DashboardQuery } from '@/lib/api/types'
import { useFormatters } from '@/lib/format'

const QUERY_KEYS = ['area_id', 'date_from', 'date_to'] as const
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DAYS_FROM_HOURS = 48

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

export function useDurationFormatter(): (hours: number) => string {
  const { t } = useTranslation('dashboard')
  const { number } = useFormatters()
  return useCallback(
    (hours: number) =>
      hours >= DAYS_FROM_HOURS
        ? t('duration.days', { value: number(hours / 24, { maximumFractionDigits: 1 }) })
        : t('duration.hours', { value: number(hours, { maximumFractionDigits: 1 }) }),
    [number, t],
  )
}
