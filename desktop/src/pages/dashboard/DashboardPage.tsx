import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Sparkles } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { inputClass, selectClass } from '@/components/ui/styles'
import { useAreaOptions } from '@/lib/api/admin'
import { dashboardKeys, useDashboardSummary } from '@/lib/api/dashboard'
import type { DashboardQuery, DateRange } from '@/lib/api/types'
import { useFormatters } from '@/lib/format'
import { useSessionStore } from '@/stores/session'
import { BottleneckHeatmap } from './BottleneckHeatmap'
import { BlockSkeleton } from './DashboardBlock'
import { useDashboardQuery } from './dashboardQuery'
import { AtRiskList, StalledList } from './HighlightList'
import { SummaryCards } from './SummaryCards'

const StatusChart = lazy(() =>
  import('./StatusChart').then((module) => ({ default: module.StatusChart })),
)
const TrendChart = lazy(() =>
  import('./TrendChart').then((module) => ({ default: module.TrendChart })),
)

const RANGE_DAY: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeZone: 'UTC' }

interface FiltersProps {
  query: DashboardQuery
  onChange: (changes: Partial<DashboardQuery>) => void
}

function AreaFilter({ query, onChange }: FiltersProps) {
  const { t } = useTranslation('dashboard')
  const areas = useAreaOptions()

  return (
    <label className="flex w-52 flex-col gap-1 text-xs">
      <span className="text-muted-foreground font-medium">{t('filters.area')}</span>
      <select
        value={query.area_id ?? ''}
        onChange={(event) => {
          onChange({ area_id: event.target.value || undefined })
        }}
        className={selectClass}
      >
        <option value="">{t('filters.allAreas')}</option>
        {areas.data?.map((area) => (
          <option key={area.id} value={area.id}>
            {area.name}
          </option>
        ))}
      </select>
    </label>
  )
}

function DashboardFilters({ query, onChange, isAdmin }: FiltersProps & { isAdmin: boolean }) {
  const { t } = useTranslation('dashboard')
  const hasRange = Boolean(query.date_from ?? query.date_to)

  return (
    <div role="group" aria-label={t('filters.label')} className="flex flex-wrap items-end gap-3">
      {isAdmin && <AreaFilter query={query} onChange={onChange} />}
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground font-medium">{t('filters.from')}</span>
        <input
          type="date"
          value={query.date_from ?? ''}
          max={query.date_to}
          onChange={(event) => {
            onChange({ date_from: event.target.value || undefined })
          }}
          className={`${inputClass} w-auto`}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground font-medium">{t('filters.to')}</span>
        <input
          type="date"
          value={query.date_to ?? ''}
          min={query.date_from}
          onChange={(event) => {
            onChange({ date_to: event.target.value || undefined })
          }}
          className={`${inputClass} w-auto`}
        />
      </label>
      {hasRange && (
        <Button
          variant="ghost"
          onClick={() => {
            onChange({ date_from: undefined, date_to: undefined })
          }}
        >
          {t('filters.reset')}
        </Button>
      )}
    </div>
  )
}

function RangeLabel({ range }: { range: DateRange }) {
  const { t } = useTranslation('dashboard')
  const { dateTime } = useFormatters()
  const day = (value: string) => dateTime(`${value}T00:00:00Z`, RANGE_DAY)
  return (
    <p className="text-muted-foreground text-xs">
      {t('range', { from: day(range.date_from), to: day(range.date_to), timezone: range.timezone })}
    </p>
  )
}

function AiRecommendations() {
  const { t } = useTranslation('dashboard')
  return (
    <section className="text-muted-foreground flex items-center gap-3 rounded-xl border border-dashed p-5">
      <span className="bg-primary-soft text-primary rounded-lg p-2">
        <Sparkles className="size-4" aria-hidden="true" />
      </span>
      <div>
        <h3 className="text-foreground text-sm font-semibold">{t('ai.title')}</h3>
        <p className="text-xs">{t('ai.comingSoon')}</p>
      </div>
    </section>
  )
}

export function DashboardPage() {
  const { t } = useTranslation('dashboard')
  const { dateTime } = useFormatters()
  const queryClient = useQueryClient()
  const role = useSessionStore((state) => state.user?.role)
  const [query, setQuery] = useDashboardQuery()
  const summary = useDashboardSummary(query)
  const isAdmin = role === 'admin'
  const showsBottlenecks = role !== undefined && role !== 'requester'

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
          {summary.data && <RangeLabel range={summary.data.range} />}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <DashboardFilters query={query} onChange={setQuery} isAdmin={isAdmin} />
          <div className="flex flex-col items-end gap-1">
            {summary.dataUpdatedAt > 0 && (
              <span className="text-muted-foreground text-xs">
                {t('updatedAt', { time: dateTime(summary.dataUpdatedAt, { timeStyle: 'short' }) })}
              </span>
            )}
            <Button
              onClick={() => void queryClient.invalidateQueries({ queryKey: dashboardKeys.all })}
              disabled={summary.isFetching}
            >
              <RefreshCw
                className={`size-4 ${summary.isFetching ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              {t('refresh')}
            </Button>
          </div>
        </div>
      </div>

      <SummaryCards query={query} summary={summary.data} state={summary} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Suspense fallback={<BlockSkeleton rows={6} />}>
          <StatusChart query={query} />
          <TrendChart query={query} />
        </Suspense>
      </div>

      {showsBottlenecks && <BottleneckHeatmap query={query} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <AtRiskList query={query} />
        <StalledList query={query} />
      </div>

      <AiRecommendations />
    </div>
  )
}
