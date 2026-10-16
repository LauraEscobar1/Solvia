import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type AIMessage,
  REQUEST_PRIORITIES,
  REQUEST_STATUSES,
  RISK_FACTORS,
  type UILanguage,
} from '@/lib/api/types'
import { useFormatters } from '@/lib/format'

const AI_PREFIX = 'ai.'

export function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
}

export function useAILanguage(): UILanguage {
  const { i18n } = useTranslation()
  return (i18n.resolvedLanguage ?? i18n.language).startsWith('en') ? 'en' : 'es'
}

export function useAIText(): (message: AIMessage) => string {
  const { t, i18n } = useTranslation(['ai', 'requests'])
  const { number } = useFormatters()

  return useCallback(
    (message: AIMessage) => {
      if (message.text) return message.text
      if (!message.code) return ''
      const params: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(message.params)) {
        if (key === 'factor' && isOneOf(RISK_FACTORS, value)) {
          params[key] = t(`ai:factors.${value}`).toLowerCase()
        } else if (key === 'status' && isOneOf(REQUEST_STATUSES, value)) {
          params[key] = t(`requests:status.${value}`)
        } else if (key === 'priority' && isOneOf(REQUEST_PRIORITIES, value)) {
          params[key] = t(`requests:priority.${value}`).toLowerCase()
        } else if (typeof value === 'number') {
          params[key] = number(value, { maximumFractionDigits: 1 })
        } else {
          params[key] = value ?? '—'
        }
      }
      const key = message.code.startsWith(AI_PREFIX)
        ? message.code.slice(AI_PREFIX.length)
        : message.code
      return i18n.t(key, { ...params, ns: 'ai', defaultValue: t('ai:risk.noInsight') })
    },
    [i18n, number, t],
  )
}

export function riskTone(score: number): 'danger' | 'warning' | 'success' {
  if (score >= 70) return 'danger'
  if (score >= 40) return 'warning'
  return 'success'
}
