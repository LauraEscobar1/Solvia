import {
  AlarmClock,
  CheckCircle2,
  Clock,
  Inbox,
  type LucideIcon,
  Timer,
  TriangleAlert,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { DashboardQuery, DashboardSummary } from '@/lib/api/types'
import { useFormatters } from '@/lib/format'
import { type RequestFilters, requestsPath } from '@/lib/requests/filters'
import { BlockSkeleton, type BlockState, DashboardBlock } from './DashboardBlock'
import { useDurationFormatter } from './dashboardQuery'

type CardKey = 'open' | 'due_soon' | 'overdue' | 'stalled' | 'completed' | 'resolution'
type CardTone = 'default' | 'warning' | 'danger'

interface CardSpec {
  key: CardKey
  icon: LucideIcon
  tone: CardTone
  value: (summary: DashboardSummary) => number | null
  filters: (summary: DashboardSummary) => Partial<RequestFilters>
}

const TONE_CLASSES: Record<CardTone, string> = {
  default: 'text-primary bg-primary-soft',
  warning: 'text-warning bg-warning-soft',
  danger: 'text-danger bg-danger-soft',
}

const VALUE_CLASSES: Record<CardTone, string> = {
  default: '',
  warning: 'text-warning',
  danger: 'text-danger',
}

const CARDS: readonly CardSpec[] = [
  {
    key: 'open',
    icon: Inbox,
    tone: 'default',
    value: (summary) => summary.open,
    filters: () => ({ status: ['received', 'assigned', 'in_progress'] }),
  },
  {
    key: 'due_soon',
    icon: AlarmClock,
    tone: 'warning',
    value: (summary) => summary.due_soon,
    filters: () => ({ sla_status: 'at_risk' }),
  },
  {
    key: 'overdue',
    icon: TriangleAlert,
    tone: 'danger',
    value: (summary) => summary.overdue,
    filters: () => ({ overdue: true }),
  },
  {
    key: 'stalled',
    icon: Clock,
    tone: 'warning',
    value: (summary) => summary.stalled,
    filters: () => ({ stalled: true }),
  },
  {
    key: 'completed',
    icon: CheckCircle2,
    tone: 'default',
    value: (summary) => summary.completed_last_7_days,
    filters: (summary) => ({ status: ['completed'], completed_from: summary.completed_since }),
  },
  {
    key: 'resolution',
    icon: Timer,
    tone: 'default',
    value: (summary) => summary.avg_resolution_hours,
    filters: (summary) => ({
      status: ['completed'],
      completed_from: summary.range.date_from,
      completed_to: summary.range.date_to,
    }),
  },
]

interface SummaryCardsProps {
  query: DashboardQuery
  summary: DashboardSummary | undefined
  state: BlockState
}

export function SummaryCards({ query, summary, state }: SummaryCardsProps) {
  const { t } = useTranslation('dashboard')
  const { number } = useFormatters()
  const duration = useDurationFormatter()

  if (!summary || state.isError || state.isPending) {
    return (
      <DashboardBlock
        title={t('cards.label')}
        state={state}
        skeleton={<BlockSkeleton rows={2} />}
      />
    )
  }

  return (
    <section aria-label={t('cards.label')}>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {CARDS.map(({ key, icon: Icon, tone, value, filters }) => {
          const label = t(`cards.${key}`)
          const raw = value(summary)
          const display =
            raw === null
              ? t('cards.noValue')
              : key === 'resolution'
                ? duration(raw)
                : number(raw)
          return (
            <li key={key}>
              <Link
                to={requestsPath({ area_id: query.area_id, ...filters(summary) })}
                aria-label={t('cards.viewList', { label })}
                className="bg-surface hover:border-primary flex h-full flex-col gap-3 rounded-xl border p-4 shadow-xs transition-colors"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-xs font-medium">{label}</span>
                  <span className={`rounded-lg p-1.5 ${TONE_CLASSES[tone]}`}>
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                </span>
                <span
                  data-testid={`summary-${key}`}
                  className={`text-2xl font-semibold tracking-tight ${VALUE_CLASSES[tone]}`}
                >
                  {display}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
