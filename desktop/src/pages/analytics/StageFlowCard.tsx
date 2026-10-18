import { Triangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Grow } from '@/components/motion/Motion'
import { SectionCard } from '@/components/ui/Card'
import { QueryState, SkeletonRows } from '@/components/ui/States'
import { useStageFlow } from '@/lib/api/dashboard'
import type { DashboardQuery, StageFlowItem } from '@/lib/api/types'
import { useFormatters, useLongDuration } from '@/lib/format'
import { STAGE_COLORS } from '@/lib/requests/tones'

const MULTIPLE_FORMAT: Intl.NumberFormatOptions = { minimumFractionDigits: 1, maximumFractionDigits: 1 }

function StageRow({ item, maxCount }: { item: StageFlowItem; maxCount: number }) {
  const { t } = useTranslation(['dashboard', 'requests'])
  const { number } = useFormatters()
  const duration = useLongDuration()
  const width = maxCount > 0 ? (item.count / maxCount) * 100 : 0
  const over =
    item.median_hours !== null && item.target_hours !== null && item.target_hours > 0 && item.median_hours > item.target_hours
      ? item.median_hours / item.target_hours
      : null

  let timing = t('flow.noOpen')
  if (item.median_hours !== null) {
    timing =
      item.target_hours === null
        ? t('flow.median', { value: duration(item.median_hours) })
        : t('flow.medianTarget', { value: duration(item.median_hours), target: duration(item.target_hours) })
  }

  return (
    <li className="flex flex-col gap-2" data-stage={item.status}>
      <div className="text-caption flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-body font-semibold">{t(`requests:status.${item.status}`)}</span>
        <span className="text-muted-foreground">{timing}</span>
      </div>
      <div className="flex items-center gap-4">
        <div aria-hidden="true" className="bg-surface-sunken h-6 flex-1 overflow-hidden rounded-full">
          <div className="h-full" style={{ width: `${width}%` }}>
            <Grow className={`h-full rounded-full ${STAGE_COLORS[item.status]}`} />
          </div>
        </div>
        <span className="text-heading w-10 shrink-0 text-right tabular-nums">
          <span aria-hidden="true">{number(item.count)}</span>
          <span className="sr-only">{t('flow.count', { count: item.count })}</span>
        </span>
      </div>
      {over !== null && (
        <span className="bg-warning-soft text-warning-soft-foreground text-caption inline-flex h-6 items-center gap-1.5 self-start rounded-full px-2.5 font-semibold">
          <Triangle className="size-2.5 fill-current" aria-hidden="true" />
          {t('flow.over', { value: t('bottlenecks.multiple', { value: number(over, MULTIPLE_FORMAT) }) })}
        </span>
      )}
    </li>
  )
}

export function StageFlowCard({ query }: { query: DashboardQuery }) {
  const { t } = useTranslation('dashboard')
  const flow = useStageFlow(query)
  const stages = flow.data?.stages ?? []
  const maxCount = Math.max(0, ...stages.map((item) => item.count))

  return (
    <SectionCard title={t('flow.title')} description={t('flow.description')}>
      <QueryState query={flow} loading={<SkeletonRows rows={3} />}>
        <ul className={`flex flex-col gap-5 transition-opacity ${flow.isPlaceholderData ? 'opacity-60' : ''}`}>
          {stages.map((item) => (
            <StageRow key={item.status} item={item} maxCount={maxCount} />
          ))}
        </ul>
      </QueryState>
    </SectionCard>
  )
}
