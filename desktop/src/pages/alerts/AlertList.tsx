import {
  AlarmClock,
  Check,
  Clock,
  ExternalLink,
  type LucideIcon,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/Button'
import { alertStage, useAlertMessage } from '@/lib/alerts/messages'
import { useMarkAlertRead } from '@/lib/api/alerts'
import type { Alert, AlertType } from '@/lib/api/types'
import { useFormatters } from '@/lib/format'
import { requestsPath } from '@/lib/requests/filters'

const TYPE_ICONS: Record<AlertType, LucideIcon> = {
  due_soon: AlarmClock,
  overdue: TriangleAlert,
  stalled: Clock,
  bottleneck: TriangleAlert,
  ai_risk: Sparkles,
}

function alertLink(alert: Alert): string {
  if (alert.request) return `/requests/${alert.request.id}`
  const stage = alertStage(alert)
  return requestsPath({ area_id: alert.area.id, status: stage ? [stage] : [] })
}

function AlertItem({ alert }: { alert: Alert }) {
  const { t } = useTranslation('alerts')
  const { relative } = useFormatters()
  const message = useAlertMessage()
  const markRead = useMarkAlertRead()
  const Icon = TYPE_ICONS[alert.type]
  const critical = alert.severity === 'critical'

  return (
    <li
      data-alert-id={alert.id}
      className={[
        'bg-surface flex gap-3 rounded-xl border p-4 shadow-xs',
        alert.is_read ? '' : 'border-l-primary border-l-4',
      ].join(' ')}
    >
      <span
        className={`h-fit rounded-lg p-2 ${critical ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'}`}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={critical ? 'danger' : 'warning'}>
            {t(`severity.${alert.severity}`)}
          </StatusBadge>
          <span className="text-muted-foreground text-xs font-medium">{t(`types.${alert.type}`)}</span>
          <span className="text-muted-foreground text-xs">· {alert.area.name}</span>
          {!alert.is_read && (
            <span className="text-primary text-xs font-semibold">{t('unread')}</span>
          )}
        </div>
        <p className="text-sm">{message(alert)}</p>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span>{t('detectedAt', { time: relative(alert.created_at) })}</span>
          {alert.resolved_at && (
            <span className="text-success">{t('resolvedAt', { time: relative(alert.resolved_at) })}</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <Link
          to={alertLink(alert)}
          className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
        >
          {alert.request ? t('viewRequest') : t('viewRequests')}
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </Link>
        {!alert.is_read && (
          <Button
            variant="ghost"
            disabled={markRead.isPending}
            onClick={() => {
              markRead.mutate(alert.id)
            }}
          >
            <Check className="size-4" aria-hidden="true" />
            {t('markRead')}
          </Button>
        )}
      </div>
    </li>
  )
}

export function AlertList({ alerts }: { alerts: Alert[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {alerts.map((alert) => (
        <AlertItem key={alert.id} alert={alert} />
      ))}
    </ul>
  )
}
