import { CircleAlert, Clock3, Dot, Pause } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Pill, type PillTone } from '@/components/ui/Pill'
import type { RequestPriority, RequestStatus } from '@/lib/api/types'
import { useNow } from '@/lib/clock'
import { useCompactDuration } from '@/lib/format'
import { type DueKind, dueKind, type DueRequest } from '@/lib/requests/due'
import { riskLevel, STAGE_ORDER, type RiskLevel } from '@/lib/requests/tones'

const HOUR_MS = 3_600_000

const PRIORITY_TONES: Record<RequestPriority, PillTone> = {
  critical: 'solid',
  high: 'outline',
  medium: 'subtle-outline',
  low: 'plain',
}

export function PriorityPill({ priority, prefixed = false }: { priority: RequestPriority; prefixed?: boolean }) {
  const { t } = useTranslation('requests')
  const label = t(`priority.${priority}`)
  return (
    <Pill tone={prefixed && priority === 'low' ? 'neutral' : PRIORITY_TONES[priority]}>
      {prefixed ? t('priorityLabel', { priority: label }) : label}
    </Pill>
  )
}

const DUE_TONES: Record<Exclude<DueKind, 'closed'>, PillTone> = {
  overdue: 'danger',
  at_risk: 'warning',
  stalled: 'stalled',
  on_track: 'neutral',
  none: 'neutral',
}

const DUE_ICONS = {
  overdue: CircleAlert,
  at_risk: Clock3,
  stalled: Pause,
  on_track: Dot,
  none: Dot,
} as const

export function DuePill({ request }: { request: DueRequest }) {
  const { t } = useTranslation(['requests', 'common'])
  const now = useNow()
  const compact = useCompactDuration()
  const kind = dueKind(request)
  if (kind === 'closed') return <span className="text-subtle-foreground">{t('common:noValue')}</span>

  const due = request.due_at ? new Date(request.due_at).getTime() : null
  const idle = (now - new Date(request.last_activity_at).getTime()) / HOUR_MS
  const label =
    kind === 'overdue' && due !== null
      ? t('due.overdue', { time: compact((now - due) / HOUR_MS) })
      : kind === 'stalled'
        ? t('due.stalled', { time: compact(idle) })
        : due !== null
          ? t('due.dueIn', { time: compact((due - now) / HOUR_MS) })
          : t('due.none')
  const Icon = DUE_ICONS[kind]

  return (
    <Pill tone={DUE_TONES[kind]} icon={<Icon className="size-3.5 shrink-0" aria-hidden="true" />}>
      {label}
    </Pill>
  )
}

const RISK_TONES: Record<RiskLevel, { pill: PillTone; inner: string }> = {
  high: { pill: 'danger', inner: 'bg-pill-inner text-ink' },
  medium: { pill: 'warning', inner: 'bg-pill-inner text-ink' },
  low: { pill: 'neutral', inner: 'bg-pill-inner-neutral text-neutral-soft-foreground' },
}

export function RiskPill({ score }: { score: number | null }) {
  const { t } = useTranslation(['ai', 'common'])
  if (score === null) return <span className="text-subtle-foreground">{t('common:noValue')}</span>
  const level = riskLevel(score)
  const { pill, inner } = RISK_TONES[level]
  return (
    <Pill tone={pill} className="pr-0.5" title={t('risk.scoreTitle', { score })}>
      {t(`risk.levels.${level}`)}
      <span className={`text-caption ml-1 inline-flex h-5 min-w-7 items-center justify-center rounded-full px-1.5 tabular-nums ${inner}`}>
        {score}
      </span>
    </Pill>
  )
}

export function StageProgress({ status }: { status: RequestStatus }) {
  const { t } = useTranslation('requests')
  const reached = STAGE_ORDER.indexOf(status)
  return (
    <span className="inline-flex flex-col gap-1.5">
      <span className="text-body font-semibold whitespace-nowrap">{t(`status.${status}`)}</span>
      <span aria-hidden="true" className="flex gap-1">
        {STAGE_ORDER.map((stage, index) => (
          <span
            key={stage}
            className={`h-1 w-4 rounded-full ${index <= reached ? 'bg-foreground' : 'bg-divider'}`}
          />
        ))}
      </span>
    </span>
  )
}
