import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

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
    }),
    [locale],
  )
}
