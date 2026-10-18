import { Triangle } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { SectionCard } from '@/components/ui/Card'
import { EmptyState, QueryState, SkeletonRows } from '@/components/ui/States'
import { useBottlenecks } from '@/lib/api/dashboard'
import { type BottleneckCell, type DashboardQuery, SLA_STAGES } from '@/lib/api/types'
import { useFormatters, useLongDuration } from '@/lib/format'
import { requestsPath } from '@/lib/requests/filters'
import { type BottleneckLevel as Level, cellLevel, cellMultiple, SLOW_MULTIPLE } from './bottleneckLevel'

const MULTIPLE_FORMAT: Intl.NumberFormatOptions = { minimumFractionDigits: 1, maximumFractionDigits: 1 }

const LEVEL_CLASSES: Record<Level, string> = {
  normal: 'bg-surface-raised border-card-edge text-foreground border',
  slow: 'bg-warning-soft text-warning-soft-foreground',
  bottleneck: 'bg-danger-soft text-danger-soft-foreground',
}

const LEVEL_MARKS: Record<Level, number> = { normal: 0, slow: 1, bottleneck: 2 }

function LevelMark({ level }: { level: Level }) {
  const marks = LEVEL_MARKS[level]
  if (marks === 0) return null
  return (
    <span aria-hidden="true" className="inline-flex gap-px">
      {Array.from({ length: marks }, (_, index) => (
        <Triangle key={index} className="size-2.5 fill-current" />
      ))}
    </span>
  )
}

function MatrixCell({ cell }: { cell: BottleneckCell }) {
  const { t } = useTranslation(['dashboard', 'requests', 'common'])
  const { number } = useFormatters()
  const duration = useLongDuration()
  const tooltipId = useId()
  const level = cellLevel(cell)
  const multiple = cellMultiple(cell)
  const stage = t(`requests:status.${cell.status}`)
  const value = multiple === null ? null : t('bottlenecks.multiple', { value: number(multiple, MULTIPLE_FORMAT) })
  const hours = (amount: number | null) => (amount === null ? t('common:noValue') : duration(amount))

  return (
    <Link
      to={requestsPath({ area_id: cell.area.id, status: [cell.status] })}
      aria-label={t('bottlenecks.cell', {
        area: cell.area.name,
        stage,
        value: value ?? t('bottlenecks.noData'),
        level: t(`bottlenecks.levels.${level}`),
      })}
      aria-describedby={tooltipId}
      data-level={level}
      className={`group rounded-cell text-body relative flex h-10 items-center justify-center gap-1.5 font-semibold tabular-nums transition-[filter] hover:brightness-95 ${LEVEL_CLASSES[level]}`}
    >
      <LevelMark level={level} />
      <span>{value ?? t('common:noValue')}</span>
      <span
        id={tooltipId}
        role="tooltip"
        className="bg-feature text-feature-foreground on-dark shadow-pop text-caption rounded-inner invisible absolute top-full left-1/2 z-20 mt-2 flex w-64 -translate-x-1/2 flex-col gap-1 px-3 py-2 text-left font-normal group-hover:visible group-focus-visible:visible"
      >
        <span className="font-semibold">
          {cell.area.name} · {stage}
        </span>
        <span>{t('bottlenecks.count', { count: cell.count })}</span>
        <span>{t('bottlenecks.avgHours', { value: hours(cell.avg_hours) })}</span>
        <span>{t('bottlenecks.median', { value: hours(cell.median_avg_hours) })}</span>
        <span>{t('bottlenecks.slaMax', { value: hours(cell.sla_max_hours) })}</span>
        {cell.is_bottleneck && (
          <span className="text-accent-text font-medium">
            {cell.reasons.map((reason) => t(`bottlenecks.reasons.${reason}`)).join(' · ')}
          </span>
        )}
      </span>
    </Link>
  )
}

function Legend() {
  const { t } = useTranslation('dashboard')
  const { number } = useFormatters()
  const threshold = t('bottlenecks.multiple', { value: number(SLOW_MULTIPLE, MULTIPLE_FORMAT) })
  const levels: Level[] = ['normal', 'slow', 'bottleneck']
  return (
    <ul aria-label={t('bottlenecks.legend.label')} className="text-caption text-muted-foreground flex flex-wrap gap-x-5 gap-y-2">
      {levels.map((level) => (
        <li key={level} className="flex items-center gap-2">
          <span aria-hidden="true" className={`rounded-check size-3.5 ${LEVEL_CLASSES[level]}`} />
          <span className="inline-flex items-center gap-1">
            <LevelMark level={level} />
            {t(`bottlenecks.legend.${level}`, { value: threshold })}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function BottleneckCard({ query }: { query: DashboardQuery }) {
  const { t } = useTranslation(['dashboard', 'requests'])
  const matrix = useBottlenecks(query)
  const cells = matrix.data?.cells ?? []
  const areas = [...new Map(cells.map((cell) => [cell.area.id, cell.area])).values()]

  return (
    <SectionCard title={t('bottlenecks.title')} description={t('bottlenecks.description')}>
      <QueryState
        query={matrix}
        loading={<SkeletonRows rows={5} />}
        isEmpty={cells.length === 0}
        empty={<EmptyState compact title={t('bottlenecks.empty')} />}
      >
        <div className={`flex flex-col gap-4 transition-opacity ${matrix.isPlaceholderData ? 'opacity-60' : ''}`}>
          <table className="w-full table-fixed border-separate border-spacing-x-2 border-spacing-y-1.5">
            <colgroup>
              <col className="w-[34%]" />
              {SLA_STAGES.map((stage) => (
                <col key={stage} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className="sr-only">
                  {t('bottlenecks.area')}
                </th>
                {SLA_STAGES.map((stage) => (
                  <th key={stage} scope="col" className="text-caption text-muted-foreground pb-1 text-center font-semibold">
                    {t(`requests:status.${stage}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {areas.map((area) => (
                <tr key={area.id}>
                  <th scope="row" className="text-caption truncate pr-2 text-left font-semibold">
                    {area.name}
                  </th>
                  {SLA_STAGES.map((stage) => {
                    const cell = cells.find((item) => item.area.id === area.id && item.status === stage)
                    return <td key={stage}>{cell && <MatrixCell cell={cell} />}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <Legend />
        </div>
      </QueryState>
    </SectionCard>
  )
}
