import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { SectionCard } from '@/components/ui/Card'
import { StageBar } from '@/components/ui/Progress'
import { QueryState, Skeleton } from '@/components/ui/States'
import type { useDashboardSummary } from '@/lib/api/dashboard'
import { type DashboardQuery, type DashboardSummary, SLA_STAGES } from '@/lib/api/types'
import { useFormatters } from '@/lib/format'
import { type RequestFilters, requestsPath } from '@/lib/requests/filters'
import { STAGE_COLORS } from '@/lib/requests/tones'

interface Kpi {
  key: 'open' | 'overdue' | 'dueSoon' | 'stalled'
  dot: string
  value: number
  detail: string
  filters: Partial<RequestFilters>
}

function useKpis(summary: DashboardSummary, scoped: boolean): Kpi[] {
  const { t } = useTranslation('dashboard')
  const change = summary.overdue_change
  return [
    {
      key: 'open',
      dot: 'bg-stage-in-progress',
      value: summary.open,
      detail: scoped ? t('status.yourScope') : t('status.inAreas', { count: summary.open_areas }),
      filters: { status: [...SLA_STAGES] },
    },
    {
      key: 'overdue',
      dot: 'bg-danger',
      value: summary.overdue,
      detail:
        change > 0
          ? t('status.overdueUp', { count: change })
          : change < 0
            ? t('status.overdueDown', { count: Math.abs(change) })
            : t('status.overdueSame'),
      filters: { overdue: true },
    },
    {
      key: 'dueSoon',
      dot: 'bg-warning',
      value: summary.due_soon,
      detail: t('status.highRisk', { count: summary.due_soon_high_risk }),
      filters: { sla_status: 'at_risk' },
    },
    {
      key: 'stalled',
      dot: 'bg-stalled',
      value: summary.stalled,
      detail: t('status.forgotten', { count: summary.stalled_forgotten }),
      filters: { stalled: true },
    },
  ]
}

function Figures({ summary, query, scoped }: { summary: DashboardSummary; query: DashboardQuery; scoped: boolean }) {
  const { t } = useTranslation(['dashboard', 'requests'])
  const { number } = useFormatters()
  const kpis = useKpis(summary, scoped)

  return (
    <>
      <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ key, dot, value, detail, filters }) => {
          const label = t(`status.${key}`)
          return (
            <li key={key}>
              <Link
                to={requestsPath({ area_id: query.area_id, ...filters })}
                data-testid={`kpi-${key}`}
                className="hover:bg-surface-sunken/60 rounded-inner -m-3 flex flex-col gap-2 p-3 transition-colors"
              >
                <span className="text-caption text-muted-foreground flex items-center gap-2 font-semibold">
                  <span aria-hidden="true" className={`size-2 rounded-full ${dot}`} />
                  {label}
                </span>{' '}
                <span className="text-metric tabular-nums">{number(value)}</span>{' '}
                <span className="text-caption text-subtle-foreground font-medium">{detail}</span>{' '}
                <span className="sr-only">{t('status.linkHint')}</span>
              </Link>
            </li>
          )
        })}
      </ul>
      <StageBar
        label={t('status.stagesLabel')}
        segments={SLA_STAGES.map((stage) => ({
          key: stage,
          label: t(`requests:status.${stage}`),
          count: summary.open_by_stage[stage],
          colorClass: STAGE_COLORS[stage],
        }))}
        legendItem={(segment) => t('status.stageCount', { stage: segment.label, count: number(segment.count) })}
      />
    </>
  )
}

interface StatusOverviewProps {
  summary: ReturnType<typeof useDashboardSummary>
  query: DashboardQuery
  scoped: boolean
}

export function StatusOverview({ summary, query, scoped }: StatusOverviewProps) {
  const { t } = useTranslation('dashboard')

  return (
    <SectionCard
      title={scoped ? t('status.mine') : t('status.title')}
      actions={<span className="text-caption text-subtle-foreground font-medium">{t('status.today')}</span>}
      className="gap-6"
    >
      <QueryState
        query={summary}
        loading={
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-24" />
            ))}
          </div>
        }
      >
        {summary.data && <Figures summary={summary.data} query={query} scoped={scoped} />}
      </QueryState>
    </SectionCard>
  )
}
