import type { i18n as I18n } from 'i18next'
import { useTranslation } from 'react-i18next'
import { ApiError } from './client'

export function translateError(i18n: I18n, error: unknown): string {
  const fallback = i18n.t('errors:unknown')
  if (!(error instanceof ApiError)) return fallback
  return i18n.t(error.code, { ...error.params, ns: 'errors', defaultValue: fallback })
}

export function useTranslateError(): (error: unknown) => string {
  const { i18n } = useTranslation()
  return (error) => translateError(i18n, error)
}
