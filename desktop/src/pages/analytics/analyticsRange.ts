import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

export const ANALYTICS_RANGES = ['7', '30', '90'] as const
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number]
export const DEFAULT_RANGE: AnalyticsRange = '30'

const RANGE_PARAM = 'range'

export function useAnalyticsRange(): [AnalyticsRange, (range: AnalyticsRange) => void] {
  const [search, setSearch] = useSearchParams()
  const raw = search.get(RANGE_PARAM)
  const range = ANALYTICS_RANGES.find((item) => item === raw) ?? DEFAULT_RANGE

  const update = useCallback(
    (next: AnalyticsRange) => {
      setSearch(
        (current) => {
          const params = new URLSearchParams(current)
          if (next === DEFAULT_RANGE) params.delete(RANGE_PARAM)
          else params.set(RANGE_PARAM, next)
          return params
        },
        { replace: true },
      )
    },
    [setSearch],
  )

  return [range, update]
}

function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function rangeStart(range: AnalyticsRange, now: number): string | undefined {
  if (range === DEFAULT_RANGE) return undefined
  const today = new Date(now)
  return isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (Number(range) - 1)))
}
