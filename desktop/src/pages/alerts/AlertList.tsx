import { AlarmClock, Check, Clock, type LucideIcon, Sparkles, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { IconButton } from '@/components/ui/IconButton'
import { alertStage, useAlertMessage } from '@/lib/alerts/messages'
import { useMarkAlertRead } from '@/lib/api/alerts'
import type { Alert, AlertSeverity, AlertType } from '@/lib/api/types'
import { useFormatters } from '@/lib/format'
import { requestsPath } from '@/lib/requests/filters'

const TYPE_ICONS: Record<AlertType, LucideIcon> = {
  due_soon: AlarmClock,
  overdue: TriangleAlert,
  stalled: Clock,
  bottleneck: TriangleAlert,
  ai_risk: Sparkles,
}

const SEVERITY_TILES: Record<AlertSeverity, string> = {
  critical: 'bg-danger-soft text-danger-soft-foreground',
  warning: 'bg-warning-soft text-warning-soft-foreground',
  info: 'bg-neutral-soft text-neutral-soft-foreground',
}

const SEVERITY_TEXT: Record<AlertSeverity, string> = {
  critical: 'text-danger-text',
  warning: 'text-warning-text',
  info: 'text-muted-foreground',
}

function alertLink(alert: Alert): string {
  if (alert.request) return `/requests/${alert.request.id}`
  const stage = alertStage(alert)
  return requestsPath({ area_id: alert.area.id, status: stage ? [stage] : [] })
}

function AlertItem({ alert }: { alert: Alert }) {
  const { t } = useTranslation('alerts')
  const { relative, dateTime } = useFormatters()
  const message = useAlertMessage()
  const markRead = useMarkAlertRead()
  const Icon = TYPE_ICONS[alert.type]

  return (
    <li
      data-alert-id={alert.id}
      data-read={alert.is_read}
      className="glass border-card-edge rounded-card shadow-card lift flex flex-wrap items-center gap-x-4 gap-y-3 border px-5 py-4"
    >
      <span
        aria-hidden="true"
        className={`rounded-inner inline-flex size-11 shrink-0 items-center justify-center ${SEVERITY_TILES[alert.severity]} ${alert.is_read ? 'opacity-70' : ''}`}
      >
        <Icon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 basis-80 flex-col gap-1">
        <p className="text-caption flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`font-semibold ${SEVERITY_TEXT[alert.severity]}`}>{t(`severity.${alert.severity}`)}</span>
          {alert.request ? (
            <span className="text-code text-muted-foreground font-mono">{alert.request.code}</span>
          ) : (
            <span className="text-muted-foreground font-medium">{alert.area.name}</span>
          )}
          <span className="text-muted-foreground">· {t(`types.${alert.type}`)}</span>
          {!alert.is_read && (
            <span className="bg-accent text-accent-foreground text-micro inline-flex h-5 items-center rounded-full px-2">
              {t('new')}
            </span>
          )}
        </p>
        <p className="text-body font-medium">{message(alert, { inline: true })}</p>
        {alert.resolved_at && (
          <p className="text-caption text-accent-text font-medium">{t('resolvedAt', { time: relative(alert.resolved_at) })}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <time dateTime={alert.created_at} title={dateTime(alert.created_at)} className="text-caption text-muted-foreground">
          {relative(alert.created_at)}
        </time>
        {!alert.is_read && (
          <IconButton
            icon={Check}
            label={t('markRead')}
            tooltipAlign="end"
            disabled={markRead.isPending}
            onClick={() => {
              markRead.mutate(alert.id)
            }}
          />
        )}
        <Link to={alertLink(alert)} className={buttonClasses('outline', 'sm')}>
          {alert.request ? t('viewRequest') : t('viewRequests')}
        </Link>
      </div>
    </li>
  )
}

export function AlertList({ alerts }: { alerts: Alert[] }) {
  const { t } = useTranslation('alerts')
  return (
    <ul aria-label={t('list')} className="flex flex-col gap-3">
      {alerts.map((alert) => (
        <AlertItem key={alert.id} alert={alert} />
      ))}
    </ul>
  )
}
