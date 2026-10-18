import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

const DAYS_FROM_HOURS = 48
const COMPACT_DAYS_FROM_HOURS = 24

export function intlLocaleFor(language: string): string {
  const systemLocales = typeof navigator === 'undefined' ? [] : navigator.languages
  return systemLocales.find((locale) => locale.toLowerCase().startsWith(`${language}-`)) ?? language
}

export function formatDateTime(
  value: Date | string | number,
  locale: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string {
  return new Intl.DateTimeFormat(locale, options).format(new Date(value))
}

export function formatNumber(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value)
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

export function formatRelativeTime(
  value: Date | string | number,
  locale: string,
  now: Date = new Date(),
): string {
  const seconds = (new Date(value).getTime() - now.getTime()) / 1000
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit)
  }
  return formatter.format(Math.round(seconds), 'second')
}

export function useFormatters() {
  const { i18n } = useTranslation()
  const locale = intlLocaleFor(i18n.resolvedLanguage ?? i18n.language)
  return useMemo(
    () => ({
      locale,
      dateTime: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) =>
        formatDateTime(value, locale, options),
      number: (value: number, options?: Intl.NumberFormatOptions) =>
        formatNumber(value, locale, options),
      relative: (value: Date | string | number) => formatRelativeTime(value, locale),
    }),
    [locale],
  )
}

export function useDurationFormatter(): (hours: number) => string {
  const { t } = useTranslation()
  const { number } = useFormatters()
  return useCallback(
    (hours: number) =>
      hours >= DAYS_FROM_HOURS
        ? t('duration.days', { value: number(hours / 24, { maximumFractionDigits: 1 }) })
        : t('duration.hours', { value: number(hours, { maximumFractionDigits: 1 }) }),
    [number, t],
  )
}

export type CompactUnit = 'minutes' | 'hours' | 'days'

export function compactDuration(hours: number): { unit: CompactUnit; value: number } {
  const span = Math.abs(hours)
  if (span < 1) return { unit: 'minutes', value: Math.max(1, Math.round(span * 60)) }
  if (span < COMPACT_DAYS_FROM_HOURS) return { unit: 'hours', value: Math.round(span) }
  return { unit: 'days', value: Math.round(span / 24) }
}

export function useCompactDuration(): (hours: number) => string {
  const { t } = useTranslation()
  const { number } = useFormatters()
  return useCallback(
    (hours: number) => {
      const { unit, value } = compactDuration(hours)
      return t(`duration.${unit}`, { value: number(value) })
    },
    [number, t],
  )
}

export function useLongDuration(): (hours: number) => string {
  const { t } = useTranslation()
  const { number } = useFormatters()
  return useCallback(
    (hours: number) => {
      if (hours < 1) return t('duration.lessThanHour')
      if (hours < 24) return t('duration.longHours', { value: number(Math.round(hours)) })
      const days = Math.round(hours / 24)
      return t('duration.longDays', { count: days, value: number(days) })
    },
    [number, t],
  )
}
