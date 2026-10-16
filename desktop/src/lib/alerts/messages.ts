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

export function useAlertMessage(): (alert: Alert) => string {
  const { t, i18n } = useTranslation(['alerts', 'requests', 'common'])
  const { relative } = useFormatters()
  const duration = useDurationFormatter()

  return useCallback(
    (alert: Alert) => {
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
      }
      return i18n.t(alert.message_code, {
        ...values,
        ns: 'alerts',
        defaultValue: t('alerts:unknownMessage', { code: alert.message_code }),
      })
    },
    [duration, i18n, relative, t],
  )
}
