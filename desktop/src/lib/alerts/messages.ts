import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { type Alert, REQUEST_STATUSES, type RequestStatus } from '@/lib/api/types'
import { useDurationFormatter, useFormatters } from '@/lib/format'

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function amount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function alertStage(alert: Alert): RequestStatus | null {
  const status = text(alert.params.status)
  return (REQUEST_STATUSES as readonly string[]).includes(status)
    ? (status as RequestStatus)
    : null
}

const INLINE_PREFIX = 'inline.'

export function useAlertMessage(): (alert: Alert, options?: { inline?: boolean }) => string {
  const { t, i18n } = useTranslation(['alerts', 'requests', 'common'])
  const { relative } = useFormatters()
  const duration = useDurationFormatter()

  return useCallback(
    (alert: Alert, { inline = false }: { inline?: boolean } = {}) => {
      const { params } = alert
      const stage = alertStage(alert)
      const hours = (value: unknown) => {
        const parsed = amount(value)
        return parsed === null ? '—' : duration(parsed)
      }
      const moment = (value: unknown) => {
        const parsed = text(value)
        return parsed ? relative(parsed) : '—'
      }
      const values = {
        code: text(params.code) || alert.request?.code || '',
        due: moment(params.due_at),
        since: moment(params.idle_since),
        threshold: hours(params.threshold_hours),
        status: stage ? t(`requests:status.${stage}`) : '',
        area: alert.area.name,
        count: amount(params.count) ?? 0,
        avg: hours(params.avg_hours),
        risk: amount(params.risk_score) ?? 0,
      }
      const full = i18n.t(alert.message_code, {
        ...values,
        ns: 'alerts',
        defaultValue: t('alerts:unknownMessage', { code: alert.message_code }),
      })
      if (!inline || !alert.request) return full
      return i18n.t(alert.message_code.replace(/^alert\./, INLINE_PREFIX), { ...values, ns: 'alerts', defaultValue: full })
    },
    [duration, i18n, relative, t],
  )
}
