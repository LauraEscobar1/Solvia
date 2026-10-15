import { AlarmClock, Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StatusBadge, type StatusTone } from '@/components/StatusBadge'
import type { RequestPriority, RequestStatus, RequestSummary } from '@/lib/api/types'
import { useFormatters } from '@/lib/format'

const STATUS_TONES: Record<RequestStatus, StatusTone> = {
  received: 'neutral',
  assigned: 'warning',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'neutral',
}

const PRIORITY_CLASSES: Record<RequestPriority, string> = {
  critical: 'bg-danger-soft text-danger',
  high: 'bg-warning-soft text-warning',
  medium: 'bg-primary-soft text-primary',
  low: 'bg-surface-muted text-muted-foreground',
}

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const { t } = useTranslation('requests')
  return <StatusBadge tone={STATUS_TONES[status]}>{t(`status.${status}`)}</StatusBadge>
}

export function PriorityBadge({ priority }: { priority: RequestPriority }) {
  const { t } = useTranslation('requests')
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${PRIORITY_CLASSES[priority]}`}
    >
      {t(`priority.${priority}`)}
    </span>
  )
}

export function StalledIcon() {
  const { t } = useTranslation('requests')
  return (
    <span role="img" aria-label={t('sla.stalled')} title={t('sla.stalled')} className="inline-flex">
      <Clock className="text-warning size-4 shrink-0" aria-hidden="true" />
    </span>
  )
}

export function DueDate({ request }: { request: RequestSummary }) {
  const { t } = useTranslation('requests')
  const { dateTime } = useFormatters()
  if (!request.due_at) return <span className="text-muted-foreground">{t('noDueDate')}</span>

  const tone =
    request.sla_status === 'overdue'
      ? 'text-danger font-medium'
      : request.sla_status === 'at_risk'
        ? 'text-warning font-medium'
        : 'text-muted-foreground'
  const label =
    request.sla_status === 'overdue' || request.sla_status === 'at_risk'
      ? t(`sla.${request.sla_status}`)
      : null

  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${tone}`}>
      {label && <AlarmClock className="size-3.5" aria-hidden="true" />}
      <span>{dateTime(request.due_at, { dateStyle: 'medium', timeStyle: 'short' })}</span>
      {label && <span className="sr-only">{label}</span>}
    </span>
  )
}

export function SlaFlags({ request }: { request: RequestSummary }) {
  const { t } = useTranslation('requests')
  return (
    <span className="inline-flex items-center gap-1.5">
      {request.sla_status === 'overdue' && (
        <StatusBadge tone="danger">{t('sla.overdue')}</StatusBadge>
      )}
      {request.sla_status === 'at_risk' && (
        <StatusBadge tone="warning">{t('sla.at_risk')}</StatusBadge>
      )}
      {request.is_stalled && <StalledIcon />}
    </span>
  )
}
