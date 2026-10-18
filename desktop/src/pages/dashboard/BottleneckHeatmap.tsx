import { TriangleAlert } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useBottlenecks } from '@/lib/api/dashboard'
import { type BottleneckCell, type DashboardQuery, SLA_STAGES } from '@/lib/api/types'
import { useDurationFormatter, useFormatters } from '@/lib/format'
import { requestsPath } from '@/lib/requests/filters'
import { DashboardBlock } from './DashboardBlock'

const MIN_OPACITY = 0.06
const OPACITY_RANGE = 0.5

function HeatCell({ cell, maxCount }: { cell: BottleneckCell; maxCount: number }) {
  const { t } = useTranslation(['dashboard', 'requests', 'common'])
  const { number } = useFormatters()
  const duration = useDurationFormatter()
  const tooltipId = useId()
  const stage = t(`requests:status.${cell.status}`)
  const critical = cell.reasons.length > 1
  const intensity = maxCount > 0 ? cell.count / maxCount : 0
  const hours = (value: number | null) => (value === null ? t('common:noValue') : duration(value))

  return (
    <Link
      to={requestsPath({ area_id: cell.area.id, status: [cell.status] })}
      aria-label={t('bottlenecks.open', { area: cell.area.name, stage })}
      aria-describedby={tooltipId}
      data-bottleneck={cell.is_bottleneck}
      className={[
        'group relative flex min-h-16 items-center justify-center rounded-lg border text-sm font-semibold',
        cell.is_bottleneck ? 'border-danger text-danger border-2' : '',
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-0 rounded-[inherit] ${cell.is_bottleneck ? 'bg-danger' : 'bg-primary'}`}
        style={{ opacity: MIN_OPACITY + OPACITY_RANGE * intensity }}
      />
      <span className="relative flex items-center gap-1.5">
        {cell.is_bottleneck && <TriangleAlert className="size-4" aria-hidden="true" />}
        {number(cell.count)}
      </span>
      <span
        id={tooltipId}
        role="tooltip"
        className="bg-surface text-foreground invisible absolute top-full left-1/2 z-10 mt-2 flex w-64 -translate-x-1/2 flex-col gap-1 rounded-lg border p-3 text-left text-xs font-normal shadow-lg group-hover:visible group-focus-visible:visible"
      >
        <span className="font-semibold">
          {cell.area.name} · {stage}
        </span>
        <span>{t('bottlenecks.count', { count: cell.count })}</span>
        <span>{t('bottlenecks.avgHours', { value: hours(cell.avg_hours) })}</span>
        <span>
          {t('bottlenecks.median', {
            count: number(cell.median_count, { maximumFractionDigits: 1 }),
            hours: hours(cell.median_avg_hours),
          })}
        </span>
        <span>{t('bottlenecks.slaMax', { value: hours(cell.sla_max_hours) })}</span>
        {cell.is_bottleneck && (
          <span className="text-danger font-medium">
            {critical ? t('bottlenecks.critical') : t('bottlenecks.flagged')}
            {': '}
            {cell.reasons.map((reason) => t(`bottlenecks.reasons.${reason}`)).join(' · ')}
          </span>
        )}
      </span>
    </Link>
  )
}

export function BottleneckHeatmap({ query }: { query: DashboardQuery }) {
  const { t } = useTranslation(['dashboard', 'requests'])
  const matrix = useBottlenecks(query)
  const cells = matrix.data?.cells ?? []
  const maxCount = Math.max(0, ...cells.map((cell) => cell.count))
  const areas = [...new Map(cells.map((cell) => [cell.area.id, cell.area])).values()]

  return (
    <DashboardBlock
      title={t('bottlenecks.title')}
      description={t('bottlenecks.description')}
      state={matrix}
      isEmpty={cells.length === 0}
      emptyLabel={t('bottlenecks.empty')}
    >
      <div role="table" className="grid grid-cols-[minmax(8rem,1fr)_repeat(3,minmax(0,1fr))] gap-2">
        <div role="row" className="contents">
          <span role="columnheader" className="text-muted-foreground text-xs font-medium">
            {t('bottlenecks.area')}
          </span>
          {SLA_STAGES.map((stage) => (
            <span
              key={stage}
              role="columnheader"
              className="text-muted-foreground text-center text-xs font-medium"
            >
              {t(`requests:status.${stage}`)}
            </span>
          ))}
        </div>
        {areas.map((area) => (
          <div key={area.id} role="row" className="contents">
            <span role="rowheader" className="flex items-center text-sm font-medium">
              {area.name}
            </span>
            {SLA_STAGES.map((stage) => {
              const cell = cells.find((item) => item.area.id === area.id && item.status === stage)
              return (
                <div key={stage} role="cell">
                  {cell && <HeatCell cell={cell} maxCount={maxCount} />}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </DashboardBlock>
  )
}
