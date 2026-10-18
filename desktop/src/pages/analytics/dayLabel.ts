import { useCallback } from 'react'
import { useFormatters } from '@/lib/format'

const DAY_FORMAT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' }

export function useDayLabel(): (day: string) => string {
  const { dateTime } = useFormatters()
  return useCallback((day: string) => dateTime(`${day}T00:00:00Z`, DAY_FORMAT), [dateTime])
}
